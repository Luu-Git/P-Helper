'use client';

import { useState, useEffect } from 'react';
import { 
  CalendarEntry, 
  TutorResponse, 
  AvailabilityStatus,
  STATUS_COLORS 
} from '@/types/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog } from '@headlessui/react';
import { CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { createNotification, notificationExists } from '@/lib/notificationTracking';

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

      // Get the entry to check for all tutors response (Scenario 3)
      const entry = entries.find(e => e.id === responseDialog.entryId);
      
      if (entry) {
        // After update, check if all tutors have responded
        const updatedResponses = {
          ...entry.tutorResponses,
          [user.uid]: response
        };
        
        const allTutorsResponded = tutors.every(tutor => 
          updatedResponses[tutor.id] !== undefined
        );
        
        // If all tutors have responded and no tutor is selected yet, create notification for professor
        if (allTutorsResponded && !entry.confirmation.selectedTutorId && 
            tutors.length === Object.keys(updatedResponses).length) {
          try {
            // Check if notification already exists
            const notificationAlreadyExists = await notificationExists({
              scenario: 3,
              recipientIds: [entry.professorId]
            });
            
            if (!notificationAlreadyExists) {
              // Create notification for Scenario 3: All tutors provide availability
              await createNotification({
                scenario: 3,
                recipientIds: [entry.professorId],
                professorId: entry.professorId,
                professorName: entry.professorName,
                timeSlotIds: [entry.id],
                timeSlotDetails: [{
                  date: entry.date.toDate().toISOString().split('T')[0],
                  startTime: entry.timeSlot.start,
                  endTime: entry.timeSlot.end
                }]
              });
              
              console.log('Created notification for all tutors responded');
            }
          } catch (notifyError) {
            console.error('Error creating notification for all tutors response:', notifyError);
          }
        }
      }

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
    const { entryId, selectedTutorId, tutorName } = confirmTutorDialog;
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
      
      // Get the entry to include in notification
      const entry = entries.find(e => e.id === entryId);
      
      if (entry) {
        try {
          // Create notification for Scenario 2: Professor selects a tutor
          await createNotification({
            scenario: 2,
            recipientIds: [selectedTutorId],
            professorId: user?.uid || '',
            professorName: user?.displayName || user?.email || 'A professor',
            tutorId: selectedTutorId,
            tutorName: tutorName,
            timeSlotIds: [entryId],
            timeSlotDetails: [{
              date: entry.date.toDate().toISOString().split('T')[0],
              startTime: entry.timeSlot.start,
              endTime: entry.timeSlot.end
            }]
          });
          
          console.log('Created notification for tutor selection');
        } catch (notifyError) {
          console.error('Error creating notification for tutor selection:', notifyError);
        }
      }
      
      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
    } catch (error) {
      console.error('Error confirming tutor:', error);
      setError('Failed to confirm tutor');
    }
  };

  const handleTutorAcknowledgment = async (entryId: string) => {
    if (!user || userRole !== 'tutor') return;

    try {
      const entryRef = doc(db, 'calendarEntries', entryId);
      await updateDoc(entryRef, {
        'confirmation.tutorAcknowledged': true,
        'confirmation.status': 'acknowledged',
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Clear notification when tutor acknowledges
      setRowNotifications(prev => prev.filter(n => n.entryId !== entryId));

      // Get the entry to include in notification
      const entry = entries.find(e => e.id === entryId);
      
      if (entry) {
        try {
          // Create notification for Scenario 4: Tutor acknowledges selection
          await createNotification({
            scenario: 4,
            recipientIds: [entry.professorId],
            professorId: entry.professorId,
            professorName: entry.professorName,
            tutorId: user.uid,
            tutorName: user.displayName || user.email || 'A tutor',
            timeSlotIds: [entryId],
            timeSlotDetails: [{
              date: entry.date.toDate().toISOString().split('T')[0],
              startTime: entry.timeSlot.start,
              endTime: entry.timeSlot.end
            }]
          });
          
          console.log('Created notification for tutor acknowledgment');
        } catch (notifyError) {
          console.error('Error creating notification for tutor acknowledgment:', notifyError);
        }
      }

      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
    } catch (error) {
      console.error('Error acknowledging confirmation:', error);
      setError('Failed to acknowledge confirmation');
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
    </div>
  );
} 