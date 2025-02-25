'use client';

import { useState, useEffect } from 'react';
import { 
  CalendarEntry, 
  TutorResponse, 
  AvailabilityStatus,
  STATUS_COLORS,
  TimeSlot
} from '@/types/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { doc, updateDoc, Timestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog } from '@headlessui/react';
import { CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { sendAcknowledgmentEmail } from '@/lib/emailFunctions';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  columnIndex?: number;
}

interface CalendarGridProps {
  entries: CalendarEntry[];
  tutors: User[];
  professorId: string;
  onEntryUpdate: (entryId: string) => void;
}

interface RowNotification {
  entryId: string;
  type: 'newEntry' | 'selected' | 'urgent' | 'allResponded' | 'acknowledged' | 'partial';
}

export default function CalendarGrid({ entries, tutors, professorId, onEntryUpdate }: CalendarGridProps) {
  const { user, userRole } = useAuth();
  const [responseDialog, setResponseDialog] = useState<{
    isOpen: boolean;
    entryId: string;
    status: AvailabilityStatus;
    details: string;
  }>({
    isOpen: false,
    entryId: '',
    status: 'available',
    details: ''
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    entryId: string;
  }>({
    isOpen: false,
    entryId: ''
  });
  const [confirmTutorDialog, setConfirmTutorDialog] = useState<{
    isOpen: boolean;
    entryId: string;
    selectedTutorId: string;
    tutorName: string;
  }>({
    isOpen: false,
    entryId: '',
    selectedTutorId: '',
    tutorName: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [rowNotifications, setRowNotifications] = useState<RowNotification[]>([]);
  const [pendingAcknowledgments, setPendingAcknowledgments] = useState<{[entryId: string]: boolean}>({});
  const [reviewDialog, setReviewDialog] = useState<{
    isOpen: boolean;
    entries: {
      entryId: string;
      date: Timestamp;
      timeSlot: TimeSlot;
      professorId: string;
      professorEmail: string;
    }[];
    isSubmitting: boolean;
  }>({
    isOpen: false,
    entries: [],
    isSubmitting: false
  });
  const [professorEmails, setProfessorEmails] = useState<{[id: string]: string}>({});

  // Sort tutors by column index
  const sortedTutors = [...tutors]
    .filter(tutor => tutor.columnIndex !== undefined)
    .sort((a, b) => (a.columnIndex || 0) - (b.columnIndex || 0));

  // Check for entries that need notifications
  useEffect(() => {
    if (!user || !userRole) return;

    const getNotificationEntries = () => {
      return entries.filter(entry => {
        if (userRole === 'tutor') {
          // New unresponded entries
          const hasNotResponded = !entry.tutorResponses[user.uid];
          
          // Selected by professor but not acknowledged
          const isSelectedNotAcknowledged = 
            entry.confirmation.selectedTutorId === user.uid && 
            !entry.confirmation.tutorAcknowledged;
          
          // Entry within next 24 hours without response
          const isUrgent = isWithinNextHours(entry.date, 24) && !entry.tutorResponses[user.uid];
          
          return hasNotResponded || isSelectedNotAcknowledged || isUrgent;
        } else if (userRole === 'professor' && user.uid === professorId) {
          // Check if all tutors have responded
          const allTutorsResponded = tutors.every(tutor => 
            entry.tutorResponses[tutor.id] !== undefined
          );

          // Only show notification if all tutors responded and no tutor is selected yet
          return allTutorsResponded && 
            !entry.confirmation.selectedTutorId &&
            Object.values(entry.tutorResponses).length === tutors.length;
        }
        return false;
      }).map(entry => ({
        entryId: entry.id,
        type: userRole === 'professor' ? 'allResponded' as const : 'newEntry' as const
      }));
    };

    const notificationEntries = getNotificationEntries();
    setRowNotifications(notificationEntries);
  }, [entries, user, userRole, professorId, tutors]);

  const isWithinNextHours = (date: Timestamp, hours: number): boolean => {
    const now = new Date();
    const entryDate = date.toDate();
    const hoursDiff = (entryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursDiff >= 0 && hoursDiff <= hours;
  };

  const clearNotification = (entryId: string) => {
    if (userRole === 'tutor') {
      // Tutors can clear their notifications on click
      setRowNotifications(prev => prev.filter(n => n.entryId !== entryId));
    }
    // Removed professor acknowledgment clearing since we no longer show those notifications
  };

  const handleTutorResponse = async () => {
    if (!user) return;

    try {
      const entryRef = doc(db, 'calendarEntries', responseDialog.entryId);
      const response: TutorResponse = {
        status: responseDialog.status,
        details: responseDialog.details,
        lastUpdated: Timestamp.fromDate(new Date())
      };

      await updateDoc(entryRef, {
        [`tutorResponses.${user.uid}`]: response,
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Clear notification for this entry when tutor responds
      setRowNotifications(prev => prev.filter(n => n.entryId !== responseDialog.entryId));

      // Notify parent to set up temporary listener
      onEntryUpdate(responseDialog.entryId);
      setResponseDialog(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error('Error updating response:', error);
      setError('Failed to update response');
    }
  };

  const handleTutorSelection = (entryId: string, tutorId: string) => {
    if (!tutorId) return; // Handle the "Select tutor" option

    const selectedTutor = tutors.find(t => t.id === tutorId);
    setConfirmTutorDialog({
      isOpen: true,
      entryId,
      selectedTutorId: tutorId,
      tutorName: selectedTutor?.displayName || selectedTutor?.email || 'Unknown'
    });
  };

  const handleProfessorConfirmation = async () => {
    const { entryId, selectedTutorId } = confirmTutorDialog;
    if (userRole !== 'professor') return;

    try {
      const entryRef = doc(db, 'calendarEntries', entryId);
      await updateDoc(entryRef, {
        'confirmation.selectedTutorId': selectedTutorId,
        'confirmation.status': 'confirmed',
        'confirmation.timestamp': Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Clear the notification for this entry when professor selects a tutor
      setRowNotifications(prev => prev.filter(n => n.entryId !== entryId));
      
      // Close the confirmation dialog
      setConfirmTutorDialog(prev => ({ ...prev, isOpen: false }));
      
      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
    } catch (error) {
      console.error('Error confirming tutor:', error);
      setError('Failed to confirm tutor');
    }
  };

  const handleTutorAcknowledgment = async (entryId: string) => {
    if (!user || userRole !== 'tutor') return;

    setPendingAcknowledgments(prev => ({
      ...prev,
      [entryId]: true
    }));
  };

  const handleSubmitAcknowledgments = (professorId: string) => {
    if (!user || userRole !== 'tutor') return;

    console.log('Submitting acknowledgments for professor:', professorId);
    console.log('Current professorEmails state:', professorEmails);
    console.log('Professor email for this ID:', professorEmails[professorId]);
    
    if (!professorEmails[professorId]) {
      console.error('Professor email not found for ID:', professorId);
      setError('Professor email not found. Please try again later.');
      return;
    }
    
    // Get only entries for this specific professor that have pending acknowledgments
    const pendingEntries = entries
      .filter(entry => 
        entry.professorId === professorId && 
        pendingAcknowledgments[entry.id] &&
        entry.confirmation.selectedTutorId === user.uid &&
        !entry.confirmation.tutorAcknowledged
      )
      .map(entry => ({
        entryId: entry.id,
        date: entry.date,
        timeSlot: entry.timeSlot,
        professorId: entry.professorId,
        professorEmail: professorEmails[entry.professorId] || ''
      }));

    console.log('Pending entries to acknowledge:', pendingEntries);
    
    if (pendingEntries.length === 0) {
      console.warn('No pending entries to acknowledge');
      setError('No pending entries to acknowledge');
      return;
    }
    
    setReviewDialog({
      isOpen: true,
      entries: pendingEntries,
      isSubmitting: false
    });
  };

  const handleConfirmAcknowledgments = async () => {
    if (!user || userRole !== 'tutor' || reviewDialog.entries.length === 0) return;

    try {
      setReviewDialog(prev => ({ ...prev, isSubmitting: true }));
      
      console.log('Starting acknowledgment process...');
      const professorEmail = reviewDialog.entries[0].professorEmail;
      const tutorName = user.displayName || user.email || 'Unknown Tutor';
      
      console.log('Professor email:', professorEmail);
      console.log('Tutor name:', tutorName);
      console.log('Time slots to acknowledge:', reviewDialog.entries.length);
      
      if (!professorEmail) {
        console.error('Missing professor email address');
        setError('Cannot send acknowledgment: Professor email address is missing');
        setReviewDialog(prev => ({ ...prev, isSubmitting: false }));
        return;
      }

      // Send acknowledgment email
      const emailResult = await sendAcknowledgmentEmail({
        professorEmail: professorEmail,
        tutorName: tutorName,
        timeSlots: reviewDialog.entries.map(entry => ({
          date: entry.date,
          start: entry.timeSlot.start,
          end: entry.timeSlot.end
        }))
      });
      
      console.log('Email function completed with result:', emailResult);
      
      if (!emailResult.success) {
        console.error('Email sending failed:', emailResult.error);
        setError(`Failed to send email: ${emailResult.error || 'Unknown error'}`);
        setReviewDialog(prev => ({ ...prev, isSubmitting: false }));
        return;
      }

      // Update each entry in Firestore to mark it as acknowledged
      console.log('Updating Firestore entries...');
      try {
        await Promise.all(reviewDialog.entries.map(async (entry) => {
          const entryRef = doc(db, 'calendarEntries', entry.entryId);
          await updateDoc(entryRef, {
            'confirmation.tutorAcknowledged': true,
            'confirmation.acknowledgedAt': Timestamp.fromDate(new Date()),
            updatedAt: Timestamp.fromDate(new Date())
          });
          console.log('Updated entry:', entry.entryId);
        }));
      } catch (updateError) {
        console.error('Error updating entries:', updateError);
        setError('Email was sent but failed to update entries in the database');
        setReviewDialog(prev => ({ ...prev, isSubmitting: false }));
        return;
      }

      // Clear pending acknowledgments and close dialog
      setPendingAcknowledgments({});
      setReviewDialog(prev => ({ ...prev, isOpen: false, isSubmitting: false }));
      
      console.log('Acknowledgment process completed successfully');

      // Notify parent to update entries
      reviewDialog.entries.forEach(entry => onEntryUpdate(entry.entryId));
    } catch (error) {
      console.error('Error in acknowledgment process:', error);
      setError('Failed to complete acknowledgment process');
      setReviewDialog(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (userRole !== 'professor' || user?.uid !== professorId) return;

    try {
      await deleteDoc(doc(db, 'calendarEntries', entryId));
      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
      setDeleteDialog({ isOpen: false, entryId: '' });
    } catch (error) {
      console.error('Error deleting entry:', error);
      setError('Failed to delete entry');
    }
  };

  const getResponseDisplay = (response: TutorResponse | undefined, isConfirmed: boolean, isAcknowledged: boolean) => {
    if (isConfirmed) {
      return { text: 'Confirmed', color: STATUS_COLORS.confirmed };
    }
    
    if (!response) return { text: 'Click to respond', color: STATUS_COLORS.pending };
    
    switch (response.status) {
      case 'available':
        return { text: 'Available', color: STATUS_COLORS.available };
      case 'partial':
        return { text: response.details || 'Partially Available', color: STATUS_COLORS.partial };
      case 'unavailable':
        return { text: 'Not Available', color: STATUS_COLORS.unavailable };
      default:
        return { text: 'Click to respond', color: STATUS_COLORS.pending };
    }
  };

  const getConfirmationDisplay = (entry: CalendarEntry) => {
    const selectedTutor = tutors.find(t => t.id === entry.confirmation.selectedTutorId);
    
    if (!entry.confirmation.selectedTutorId) {
      return { text: 'Pending', color: STATUS_COLORS.pending };
    }
    
    if (entry.confirmation.tutorAcknowledged) {
      return { 
        text: `Acknowledged: ${selectedTutor?.displayName || 'Unknown'}`, 
        color: STATUS_COLORS.acknowledged 
      };
    }
    
    return { 
      text: `Pending: ${selectedTutor?.displayName || 'Unknown'}`, 
      color: '#cc6633' 
    };
  };

  const getPendingCountForProfessor = () => {
    return Object.keys(pendingAcknowledgments).length;
  };

  // Add this effect to fetch professor emails
  useEffect(() => {
    const fetchProfessorEmail = async (id: string) => {
      console.log('Fetching email for professor ID:', id);
      
      // Skip if we already have this professor's email
      if (professorEmails[id]) {
        console.log('Already have email for professor:', id, professorEmails[id]);
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'users', id));
        console.log('Professor user document exists:', userDoc.exists());
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('Professor user data:', userData);
          
          if (userData.email) {
            setProfessorEmails(prev => {
              const updated = {
                ...prev,
                [id]: userData.email
              };
              console.log('Updated professorEmails state:', updated);
              return updated;
            });
          } else {
            console.error('Professor document exists but has no email field:', id);
          }
        } else {
          console.warn('Professor document not found for ID:', id);
        }
      } catch (error) {
        console.error('Error fetching professor email:', error);
      }
    };

    // Fetch email for the current professor
    if (professorId) {
      fetchProfessorEmail(professorId);
    }
    
    // Also fetch emails for all professors in entries
    const uniqueProfessorIds = Array.from(new Set(entries.map(entry => entry.professorId)));
    uniqueProfessorIds.forEach(id => {
      if (id) fetchProfessorEmail(id);
    });
  }, [professorId, entries, professorEmails]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {userRole === 'professor' && user?.uid === professorId && (
              <th className="w-12 px-2 py-3 bg-gray-50" aria-label="Actions"></th>
            )}
            <th className="px-6 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
              Time Slot
            </th>
            {sortedTutors.map((tutor) => (
              <th key={tutor.id} className="px-6 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {tutor.displayName || tutor.email}
              </th>
            ))}
            <th className="px-6 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Confirmation
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {entries.map((entry, index) => (
            <tr 
              key={entry.id} 
              className={`group ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              onClick={() => clearNotification(entry.id)}
            >
              {userRole === 'professor' && user?.uid === professorId && (
                <td className="w-12 px-2 py-4 whitespace-nowrap text-center align-middle">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialog({ isOpen: true, entryId: entry.id });
                    }}
                    className="inline-flex p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                    title="Delete time slot"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div 
                  className={`text-center p-2 rounded-lg transition-colors ${
                    rowNotifications.some(n => n.entryId === entry.id)
                      ? 'bg-violet-100 animate-pulse'
                      : ''
                  }`}
                  onClick={() => clearNotification(entry.id)}
                >
                  <div className={
                    rowNotifications.some(n => n.entryId === entry.id)
                      ? 'text-violet-700 font-medium'
                      : ''
                  }>
                    {new Date(entry.date.seconds * 1000).toLocaleDateString()}
                  </div>
                  <div className={
                    rowNotifications.some(n => n.entryId === entry.id)
                      ? 'text-violet-600'
                      : 'text-gray-500'
                  }>
                    {entry.timeSlot.start} - {entry.timeSlot.end}
                  </div>
                </div>
              </td>
              {sortedTutors.map((tutor) => {
                const response = entry.tutorResponses[tutor.id];
                const isCurrentTutor = user?.uid === tutor.id;
                const isConfirmed = entry.confirmation.selectedTutorId === tutor.id;
                const isAcknowledged = isConfirmed && entry.confirmation.tutorAcknowledged;
                const responseDisplay = getResponseDisplay(response, isConfirmed, isAcknowledged);

                return (
                  <td 
                    key={tutor.id} 
                    className="px-6 py-4 whitespace-nowrap text-sm text-center"
                    onClick={() => {
                      if (isCurrentTutor && userRole === 'tutor' && !isConfirmed) {
                        setResponseDialog({
                          isOpen: true,
                          entryId: entry.id,
                          status: response?.status || 'available',
                          details: response?.details || ''
                        });
                      }
                    }}
                  >
                    {response || isCurrentTutor ? (
                      <div 
                        className="inline-block px-3 py-1 rounded-md text-sm font-medium"
                        style={{ 
                          backgroundColor: responseDisplay.color,
                          cursor: isCurrentTutor && !isConfirmed ? 'pointer' : 'default'
                        }}
                      >
                        {responseDisplay.text}
                      </div>
                    ) : null}
                  </td>
                );
              })}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                {userRole === 'professor' && user?.uid === professorId && !entry.confirmation.selectedTutorId ? (
                  // Professor's view - can select a tutor (only shown if no tutor is selected)
                  <select
                    value={entry.confirmation.selectedTutorId || ''}
                    onChange={(e) => handleTutorSelection(entry.id, e.target.value)}
                    className="block mx-auto w-full max-w-[200px] rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Select tutor</option>
                    {sortedTutors
                      .filter(tutor => entry.tutorResponses[tutor.id]?.status === 'available')
                      .map(tutor => (
                        <option key={tutor.id} value={tutor.id}>
                          {tutor.displayName || tutor.email}
                        </option>
                      ))
                    }
                  </select>
                ) : userRole === 'tutor' && entry.confirmation.selectedTutorId === user?.uid && !entry.confirmation.tutorAcknowledged ? (
                  // Selected tutor's view - can acknowledge (only shown if not acknowledged)
                  <button
                    onClick={() => handleTutorAcknowledgment(entry.id)}
                    className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Acknowledge
                  </button>
                ) : (
                  // Status display for all other cases
                  <div 
                    className="inline-block px-3 py-1 rounded-md text-sm font-medium"
                    style={{ backgroundColor: getConfirmationDisplay(entry).color }}
                  >
                    {getConfirmationDisplay(entry).text}
                  </div>
                )}
              </td>
            </tr>
          ))}
          
          {/* New Acknowledgment Summary Row */}
          {userRole === 'tutor' && user?.uid && getPendingCountForProfessor() > 0 && (
            <tr className="bg-indigo-50">
              {user?.uid === professorId && (
                <td className="w-12 px-2 py-4"></td>
              )}
              <td colSpan={sortedTutors.length + 2} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-indigo-700 font-medium">
                    {getPendingCountForProfessor()} pending acknowledgment{getPendingCountForProfessor() !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => handleSubmitAcknowledgments(professorId)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Review & Send Acknowledgments
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, entryId: '' })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-4">
              Delete Time Slot
            </Dialog.Title>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this time slot? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteDialog({ isOpen: false, entryId: '' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEntry(deleteDialog.entryId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Response Dialog */}
      <Dialog
        open={responseDialog.isOpen}
        onClose={() => setResponseDialog(prev => ({ ...prev, isOpen: false }))}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded bg-white p-6">
            <Dialog.Title className="text-lg font-medium mb-4">Update Availability</Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={responseDialog.status}
                  onChange={(e) => setResponseDialog(prev => ({ 
                    ...prev, 
                    status: e.target.value as AvailabilityStatus 
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="available">Available</option>
                  <option value="partial">Partially Available</option>
                  <option value="unavailable">Not Available</option>
                </select>
              </div>
              {responseDialog.status === 'partial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Details</label>
                  <input
                    type="text"
                    value={responseDialog.details}
                    onChange={(e) => setResponseDialog(prev => ({ 
                      ...prev, 
                      details: e.target.value 
                    }))}
                    placeholder="e.g., 'until 12' or 'from 11:30'"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div className="flex justify-end space-x-2 mt-4">
                <button
                  onClick={() => setResponseDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTutorResponse}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Tutor Selection Confirmation Dialog */}
      <Dialog
        open={confirmTutorDialog.isOpen}
        onClose={() => setConfirmTutorDialog(prev => ({ ...prev, isOpen: false }))}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-4">
              Confirm Tutor Selection
            </Dialog.Title>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to select {confirmTutorDialog.tutorName} for this time slot?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmTutorDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleProfessorConfirmation}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Confirm
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Review Acknowledgments Dialog */}
      <Dialog
        open={reviewDialog.isOpen}
        onClose={() => setReviewDialog(prev => ({ ...prev, isOpen: false }))}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-2xl w-full rounded-lg bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-2">
              Review Acknowledgments
            </Dialog.Title>
            
            <p className="text-sm text-gray-500 mb-6">
              Upon confirmation, an email will be sent to the professor confirming your acknowledgment of their time slots.
            </p>
            
            <div className="mt-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <h3 className="text-sm font-medium text-gray-700">
                    {reviewDialog.entries[0]?.professorEmail}
                  </h3>
                </div>
                <ul className="space-y-2 ml-7">
                  {reviewDialog.entries.map(entry => (
                    <li key={entry.entryId} className="text-sm text-gray-600">
                      {new Date(entry.date.seconds * 1000).toLocaleDateString()},{' '}
                      {entry.timeSlot.start} - {entry.timeSlot.end}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm text-gray-500 italic">
                  Clicking &quot;Confirm &amp; Send&quot; will notify the professor via email
                </span>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setReviewDialog(prev => ({ ...prev, isOpen: false }))}
                    disabled={reviewDialog.isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAcknowledgments}
                    disabled={reviewDialog.isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 flex items-center"
                  >
                    {reviewDialog.isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      'Confirm & Send'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
} 