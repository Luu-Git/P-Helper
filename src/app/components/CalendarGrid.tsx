'use client';

import { useState, useEffect } from 'react';
import { 
  CalendarEntry, 
  TutorResponse, 
  AvailabilityStatus,
  STATUS_COLORS 
} from '@/types/calendar';
import { NotificationScenario } from '@/types/notifications';
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
  
  // New state for multi-select functionality
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [professorEntries, setProfessorEntries] = useState<{[professorId: string]: CalendarEntry[]}>({});
  
  // Add this to the existing state variables at the top of the component
  const [bulkPartialDialog, setBulkPartialDialog] = useState<{
    isOpen: boolean;
    details: string;
  }>({
    isOpen: false,
    details: '',
  });
  
  // Determine which entries can be selected by the current tutor
  const selectableEntries = entries.filter(entry => {
    if (userRole !== 'tutor' || !user) return false;
    // Entries that haven't been responded to by this tutor
    return !entry.tutorResponses[user.uid] && 
      // And haven't been assigned to a tutor yet
      !entry.confirmation.selectedTutorId;
  });

  // Group entries by professor
  useEffect(() => {
    const groupedEntries = entries.reduce((acc, entry) => {
      if (!acc[entry.professorId]) {
        acc[entry.professorId] = [];
      }
      acc[entry.professorId].push(entry);
      return acc;
    }, {} as {[professorId: string]: CalendarEntry[]});
    
    setProfessorEntries(groupedEntries);
  }, [entries]);

  // Sort tutors by column index
  const sortedTutors = [...tutors]
    .filter(tutor => tutor.columnIndex !== undefined)
    .sort((a, b) => (a.columnIndex || 0) - (b.columnIndex || 0));

  // Handle entry selection for bulk actions
  const handleEntrySelection = (entryId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedEntries(prev => [...prev, entryId]);
    } else {
      setSelectedEntries(prev => prev.filter(id => id !== entryId));
    }
    setError(''); // Clear any previous errors
  };

  // Modify handleBulkResponse function to handle notifications properly
  const handleBulkResponse = async (status: AvailabilityStatus) => {
    if (status === 'partial') {
      if (selectedEntries.length > 1) {
        setError('Partial availability can only be set for one entry at a time');
        return;
      }
      setBulkPartialDialog({ isOpen: true, details: '' });
      return;
    }

    setError('');
    
    if (!user || selectedEntries.length === 0) return;
    
    try {
      // Process each selected entry
      const updatedEntries: string[] = [];
      
      for (const entryId of selectedEntries) {
        await handleTutorResponse(entryId, status);
        updatedEntries.push(entryId);
      }
      
      // Clear selection after processing
      setSelectedEntries([]);
      
      console.log(`Updated ${updatedEntries.length} entries with status: ${status}`);
    } catch (error) {
      console.error('Error in bulk response update:', error);
      setError('Failed to update some entries. Please try again.');
    }
  };
  
  // Function to process notifications when all tutors have responded
  const processAllTutorsRespondedNotifications = async (entryIds: string[], response: TutorResponse) => {
    if (!user || !entryIds.length) return;

    try {
      for (const entryId of entryIds) {
        const entry = entries.find(e => e.id === entryId);
        if (!entry) continue;

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
    } catch (error) {
      console.error('Error processing all tutors responded notifications:', error);
    }
  };

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

  const handleTutorResponse = async (entryId: string, status: AvailabilityStatus, details: string = '') => {
    if (!user) return;

    try {
      const entryRef = doc(db, 'calendarEntries', entryId);
      const response: TutorResponse = {
        status,
        details,
        lastUpdated: Timestamp.fromDate(new Date())
      };

      // Update the document with the tutor's response
      await updateDoc(entryRef, {
        [`tutorResponses.${user.uid}`]: response,
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Get the entry to check for all tutors response (Scenario 3)
      const entry = entries.find(e => e.id === entryId);
      
      if (entry) {
        await processAllTutorsRespondedNotifications([entryId], response);
      }

      // Clear notification for this entry when tutor responds
      setRowNotifications(prev => prev.filter(n => n.entryId !== entryId));

      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
    } catch (error) {
      console.error('Error updating response:', error);
      setError('Failed to update response');
    }
  };

  // Update the onClick handler for the response dialog
  const handleResponseDialogSubmit = () => {
    handleTutorResponse(
      responseDialog.entryId,
      responseDialog.status,
      responseDialog.status === 'partial' ? responseDialog.details : ''
    );
    setResponseDialog({ isOpen: false, entryId: '', status: 'available', details: '' });
  };

  const handleTutorSelection = (entryId: string, tutorId: string) => {
    if (!tutorId) return;
    
    // Find the tutor to get their name
    const tutor = tutors.find(t => t.id === tutorId);
    if (!tutor) return;
    
    const tutorName = tutor.displayName || tutor.email || 'Selected Tutor';
    
    setConfirmTutorDialog({
      isOpen: true,
      entryId,
      selectedTutorId: tutorId,
      tutorName
    });
  };

  const handleProfessorConfirmation = async (entryId: string, selectedTutorId: string) => {
    if (userRole !== 'professor') return;

    try {
      const entryRef = doc(db, 'calendarEntries', entryId);
      const entry = entries.find(e => e.id === entryId);
      
      if (!entry) {
        console.error('Entry not found for confirmation');
        return;
      }
      
      // Update the entry with the selected tutor
      await updateDoc(entryRef, {
        confirmation: {
          selectedTutorId,
          confirmedAt: Timestamp.fromDate(new Date()),
          professorId: user?.uid,
          tutorAcknowledged: false
        },
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Create notification for the selected tutor (Scenario 4)
      try {
        // Check if notification already exists
        const tutorNotificationExists = await notificationExists({
          scenario: 4,
          recipientIds: [selectedTutorId]
        });
        
        if (!tutorNotificationExists) {
          await createNotification({
            scenario: 4,
            recipientIds: [selectedTutorId],
            professorId: user?.uid || '',
            professorName: user?.displayName || user?.email || 'A professor',
            tutorId: selectedTutorId,
            tutorName: getTutorName(selectedTutorId), // Use a helper function to get tutor name
            timeSlotIds: [entryId],
            timeSlotDetails: [{
              date: entry.date.toDate().toISOString().split('T')[0],
              startTime: entry.timeSlot.start,
              endTime: entry.timeSlot.end
            }]
          });
          
          console.log('Created notification for selected tutor');
        }
      } catch (notifyError) {
        console.error('Error creating notification for tutor confirmation:', notifyError);
      }

      // Notify parent to set up temporary listener
      onEntryUpdate(entryId);
    } catch (error) {
      console.error('Error confirming tutor:', error);
      setError('Failed to confirm tutor');
    }
  };

  // Helper function to get tutor name
  const getTutorName = (tutorId: string): string => {
    const tutor = tutors.find(t => t.id === tutorId);
    return tutor?.displayName || tutor?.email || 'Selected Tutor';
  };

  const handleTutorAcknowledgment = async (entryId: string) => {
    if (!user || userRole !== 'tutor') return;

    try {
      const entryRef = doc(db, 'calendarEntries', entryId);
      const entry = entries.find(e => e.id === entryId);
      
      if (!entry || entry.confirmation.selectedTutorId !== user.uid) {
        console.error('Entry not found or tutor not selected for acknowledgment');
        return;
      }
      
      // Update the entry with the tutor's acknowledgment
      await updateDoc(entryRef, {
        'confirmation.tutorAcknowledged': true,
        'confirmation.acknowledgedAt': Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date())
      });

      // Create notification for the professor (Scenario 5)
      try {
        // Check if notification already exists
        const professorNotificationExists = await notificationExists({
          scenario: NotificationScenario.PROFESSOR_NOTIFIED,
          recipientIds: [entry.professorId]
        });
        
        if (!professorNotificationExists) {
          await createNotification({
            scenario: NotificationScenario.PROFESSOR_NOTIFIED,
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
          
          console.log('Created notification for professor about tutor acknowledgment');
        }
      } catch (notifyError) {
        console.error('Error creating notification for tutor acknowledgment:', notifyError);
      }

      // Clear notifications for this entry
      setRowNotifications(prev => prev.filter(n => n.entryId !== entryId));
      
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
    
    if (!response) return { text: 'Not responded', color: STATUS_COLORS.pending };
    
    switch (response.status) {
      case 'available':
        return { text: 'Available', color: STATUS_COLORS.available };
      case 'partial':
        return { text: response.details || 'Partially Available', color: STATUS_COLORS.partial };
      case 'unavailable':
        return { text: 'Not Available', color: STATUS_COLORS.unavailable };
      default:
        return { text: 'Not responded', color: STATUS_COLORS.pending };
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
          {entries.map((entry, index) => {
            const isSelectable = userRole === 'tutor' && user && 
                                !entry.tutorResponses[user.uid] && 
                                !entry.confirmation.selectedTutorId;
            
            return (
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
                  const isEntrySelectable = isCurrentTutor && isSelectable;

                  return (
                    <td 
                      key={tutor.id} 
                      className="px-6 py-4 whitespace-nowrap text-sm text-center"
                      onClick={(e) => {
                        // Only handle click for individual response edits when there's already a response
                        // or when the tutor is specifically clicking on their cell and it's not selectable
                        if (isCurrentTutor && userRole === 'tutor' && (response || !isSelectable)) {
                          e.stopPropagation();
                          setResponseDialog({
                            isOpen: true,
                            entryId: entry.id,
                            status: response?.status || 'available',
                            details: response?.details || ''
                          });
                        }
                      }}
                    >
                      {isCurrentTutor ? (
                        isEntrySelectable ? (
                          // Show checkbox for current user's selectable entries
                          <input
                            type="checkbox"
                            checked={selectedEntries.includes(entry.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleEntrySelection(entry.id, e.target.checked);
                            }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                        ) : (
                          // Show response status for current user
                          <div 
                            className="inline-block px-3 py-1 rounded-md text-sm font-medium"
                            style={{ 
                              backgroundColor: responseDisplay.color,
                              cursor: isCurrentTutor && !isConfirmed ? 'pointer' : 'default'
                            }}
                          >
                            {responseDisplay.text}
                          </div>
                        )
                      ) : (
                        // Show other tutors' responses if they exist
                        response && (
                          <div 
                            className="inline-block px-3 py-1 rounded-md text-sm font-medium"
                            style={{ backgroundColor: responseDisplay.color }}
                          >
                            {responseDisplay.text}
                          </div>
                        )
                      )}
                    </td>
                  );
                })}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  {userRole === 'professor' && user?.uid === professorId && !entry.confirmation.selectedTutorId ? (
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
                    <button
                      onClick={() => handleTutorAcknowledgment(entry.id)}
                      className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <div 
                      className="inline-block px-3 py-1 rounded-md text-sm font-medium"
                      style={{ backgroundColor: getConfirmationDisplay(entry).color }}
                    >
                      {getConfirmationDisplay(entry).text}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {userRole === 'tutor' && selectedEntries.length > 0 && (
        <div className="mt-4 bg-gray-50 p-4 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{selectedEntries.length}</span> time slot{selectedEntries.length !== 1 ? 's' : ''} selected
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleBulkResponse('available')}
                className="px-4 py-2 rounded-md text-sm font-medium hover:bg-green-400"
                style={{ backgroundColor: STATUS_COLORS.available, color: '#000' }}
              >
                Available
              </button>
              <button
                onClick={() => handleBulkResponse('unavailable')}
                className="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
                style={{ backgroundColor: STATUS_COLORS.unavailable, color: '#fff' }}
              >
                Not Available
              </button>
              <button
                onClick={() => handleBulkResponse('partial')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  selectedEntries.length > 1
                    ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                    : 'hover:bg-yellow-400 text-black'
                }`}
                style={{ backgroundColor: selectedEntries.length > 1 ? '#ccc' : STATUS_COLORS.partial }}
                disabled={selectedEntries.length > 1}
                title={selectedEntries.length > 1 ? 'Select only one entry for partial availability' : ''}
              >
                Partially Available
              </button>
              <button
                onClick={() => setSelectedEntries([])}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300"
              >
                Clear Selection
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, entryId: '' })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900">Delete Time Slot</Dialog.Title>
            <p className="mt-2 text-sm text-gray-500">
              Are you sure you want to delete this time slot? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-md border border-gray-300"
                onClick={() => setDeleteDialog({ isOpen: false, entryId: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                onClick={() => {
                  handleDeleteEntry(deleteDialog.entryId);
                  setDeleteDialog({ isOpen: false, entryId: '' });
                }}
              >
                Delete
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog
        open={responseDialog.isOpen}
        onClose={() => setResponseDialog({ isOpen: false, entryId: '', status: 'available', details: '' })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900">Update Availability</Dialog.Title>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <div className="mt-1 flex space-x-2">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm font-medium rounded-md flex-grow ${responseDialog.status === 'available' ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                  style={{
                    backgroundColor: STATUS_COLORS.available,
                    color: 'black',
                  }}
                  onClick={() => setResponseDialog(prev => ({ ...prev, status: 'available' }))}
                >
                  Available
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm font-medium rounded-md flex-grow ${responseDialog.status === 'unavailable' ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                  style={{
                    backgroundColor: STATUS_COLORS.unavailable,
                    color: 'white',
                  }}
                  onClick={() => setResponseDialog(prev => ({ ...prev, status: 'unavailable' }))}
                >
                  Not Available
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm font-medium rounded-md flex-grow ${responseDialog.status === 'partial' ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                  style={{
                    backgroundColor: STATUS_COLORS.partial,
                    color: 'black',
                  }}
                  onClick={() => setResponseDialog(prev => ({ ...prev, status: 'partial' }))}
                >
                  Partial
                </button>
              </div>
            </div>
            {responseDialog.status === 'partial' && (
              <div className="mt-4">
                <label htmlFor="details" className="block text-sm font-medium text-gray-700">
                  Details
                </label>
                <div className="mt-1">
                  <textarea
                    id="details"
                    name="details"
                    rows={3}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Specify when you're available (e.g., 'Only until 3:30 PM')"
                    value={responseDialog.details}
                    onChange={(e) => setResponseDialog(prev => ({ ...prev, details: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-md border border-gray-300"
                onClick={() => setResponseDialog({ isOpen: false, entryId: '', status: 'available', details: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                onClick={handleResponseDialogSubmit}
              >
                Submit
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog
        open={confirmTutorDialog.isOpen}
        onClose={() => setConfirmTutorDialog({ 
          isOpen: false, 
          entryId: '', 
          selectedTutorId: '', 
          tutorName: '' 
        })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900">Confirm Tutor</Dialog.Title>
            <p className="mt-2 text-sm text-gray-500">
              Are you sure you want to confirm this tutor for the time slot? They will be notified of your selection.
            </p>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-md border border-gray-300"
                onClick={() => setConfirmTutorDialog({ 
                  isOpen: false, 
                  entryId: '', 
                  selectedTutorId: '', 
                  tutorName: '' 
                })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                onClick={() => {
                  handleProfessorConfirmation(
                    confirmTutorDialog.entryId,
                    confirmTutorDialog.selectedTutorId
                  );
                  setConfirmTutorDialog({ 
                    isOpen: false, 
                    entryId: '', 
                    selectedTutorId: '', 
                    tutorName: '' 
                  });
                }}
              >
                Confirm
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog
        open={bulkPartialDialog.isOpen}
        onClose={() => setBulkPartialDialog({ isOpen: false, details: '' })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900">Partial Availability</Dialog.Title>
            <div className="mt-4">
              <label htmlFor="bulk-details" className="block text-sm font-medium text-gray-700">
                Details
              </label>
              <div className="mt-1">
                <textarea
                  id="bulk-details"
                  name="bulk-details"
                  rows={3}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Specify when you're available (e.g., 'Only until 3:30 PM')"
                  value={bulkPartialDialog.details}
                  onChange={(e) => setBulkPartialDialog(prev => ({ ...prev, details: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-md border border-gray-300"
                onClick={() => setBulkPartialDialog({ isOpen: false, details: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                onClick={async () => {
                  if (selectedEntries.length === 1) {
                    try {
                      await handleTutorResponse(
                        selectedEntries[0],
                        'partial',
                        bulkPartialDialog.details
                      );
                      setSelectedEntries([]);
                      setBulkPartialDialog({ isOpen: false, details: '' });
                    } catch (error) {
                      console.error('Error updating partial availability:', error);
                      setError('Failed to update partial availability');
                    }
                  } else {
                    setBulkPartialDialog({ isOpen: false, details: '' });
                  }
                }}
              >
                Submit
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
} 