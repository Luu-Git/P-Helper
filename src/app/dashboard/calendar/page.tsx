'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  CalendarEntry, 
  TimeSlot,
  STATUS_COLORS 
} from '@/types/calendar';
import { Dialog } from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import CalendarGrid from '@/app/components/CalendarGrid';
import TutorHoursOverview from '@/app/components/TutorHoursOverview';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  columnIndex?: number;
}

export default function Calendar() {
  const { user, userRole } = useAuth();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [tutors, setTutors] = useState<User[]>([]);
  const [professors, setProfessors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [newEntry, setNewEntry] = useState<{
    date: string;
    startTime: string;
    endTime: string;
    duration: 30 | 60;
  }>({
    date: '',
    startTime: '',
    endTime: '',
    duration: 60
  });
  const [activeDocIds] = useState(new Set<string>());
  const unsubscribeRefs = useRef<{ [key: string]: () => void }>({});

  // Add validation state
  const [formErrors, setFormErrors] = useState<{
    date?: string;
    startTime?: string;
    endTime?: string;
  }>({});

  // Add these helper functions for time selection
  const hours = Array.from({ length: 16 }, (_, i) => i + 7); // 7 to 22
  const minutes = [0, 15, 30, 45];

  const formatTimeValue = (hour: number, minute: number) => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const parseTimeValue = (timeString: string) => {
    if (!timeString) {
      return { hour: 0, minute: 0 };
    }
    const [hour = '0', minute = '0'] = timeString.split(':');
    return { 
      hour: Number(hour), 
      minute: Number(minute)
    };
  };

  const handleTimeChange = (type: 'start' | 'end', field: 'hour' | 'minute', value: number) => {
    const timeKey = `${type}Time` as 'startTime' | 'endTime';
    const currentTime = parseTimeValue(newEntry[timeKey]);
    
    let updatedTime = '';
    if (field === 'hour') {
      updatedTime = formatTimeValue(value, currentTime.minute);
    } else {
      updatedTime = formatTimeValue(currentTime.hour || 7, value);
    }
    
    setNewEntry(prev => ({ ...prev, [timeKey]: updatedTime }));
  };

  // Validate form fields
  const validateForm = () => {
    const errors: typeof formErrors = {};
    
    if (!newEntry.date) {
      errors.date = 'Date is required';
    } else if (new Date(newEntry.date) < new Date(new Date().setHours(0,0,0,0))) {
      errors.date = 'Date cannot be in the past';
    }
    
    if (!newEntry.startTime) {
      errors.startTime = 'Start time is required';
    }
    
    if (!newEntry.endTime) {
      errors.endTime = 'End time is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Fetch users (tutors and professors)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        // Fetch tutors
        const tutorsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'tutor')
        );
        const tutorSnapshot = await getDocs(tutorsQuery);
        const tutorData = tutorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as User));
        setTutors(tutorData);

        // Fetch professors
        const professorsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'professor')
        );
        const professorSnapshot = await getDocs(professorsQuery);
        const professorData = professorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as User));
        setProfessors(professorData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching users:', error);
        setError('Failed to load users');
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Initial load of all calendar entries
  useEffect(() => {
    const fetchAllEntries = async () => {
      try {
        const q = query(
          collection(db, 'calendarEntries'),
          orderBy('date', 'asc')
        );
        const snapshot = await getDocs(q);
        const newEntries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CalendarEntry));
        setEntries(newEntries);
      } catch (error) {
        console.error('Error fetching calendar entries:', error);
        setError('Failed to load calendar entries');
      }
    };

    fetchAllEntries();
  }, []);

  // Function to set up temporary listener for a specific document
  const setupTemporaryListener = (entryId: string) => {
    if (!user) return;

    // If there's an existing listener for this document, clear it first
    if (unsubscribeRefs.current[entryId]) {
      unsubscribeRefs.current[entryId]();
    }

    // Set up new listener
    const unsubscribe = onSnapshot(
      doc(db, 'calendarEntries', entryId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setEntries(prev => prev.map(entry => 
            entry.id === entryId 
              ? { id: docSnapshot.id, ...docSnapshot.data() } as CalendarEntry 
              : entry
          ));
        } else {
          // Document was deleted
          setEntries(prev => prev.filter(entry => entry.id !== entryId));
        }
      },
      (error) => {
        console.error('Error in real-time update:', error);
        setError('Failed to get real-time updates');
      }
    );

    // Store the unsubscribe function
    unsubscribeRefs.current[entryId] = unsubscribe;

    // Set up cleanup after 5 seconds
    setTimeout(() => {
      if (unsubscribeRefs.current[entryId]) {
        unsubscribeRefs.current[entryId]();
        delete unsubscribeRefs.current[entryId];
      }
    }, 5000);
  };

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(unsubscribeRefs.current).forEach(unsubscribe => unsubscribe());
    };
  }, []);

  // Function to generate time slots
  const generateTimeSlots = (startTime: string, endTime: string, duration: 30 | 60): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    // Convert to minutes for easier calculation
    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    while (currentMinutes + duration <= endMinutes) {
      // Calculate slot start
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMinute = currentMinutes % 60;
      
      // Calculate slot end
      const slotEndMinutes = currentMinutes + duration;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMinute = slotEndMinutes % 60;

      // Format times with leading zeros
      const formatTime = (hour: number, minute: number) => 
        `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      slots.push({
        start: formatTime(slotStartHour, slotStartMinute),
        end: formatTime(slotEndHour, slotEndMinute)
      });

      currentMinutes += duration;
    }

    return slots;
  };

  // Function to validate time slot input
  const validateTimeSlots = (startTime: string, endTime: string, duration: 30 | 60): string | null => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes >= endMinutes) {
      return 'End time must be after start time';
    }

    if ((endMinutes - startMinutes) < duration) {
      return 'Time range must be at least the duration of one slot';
    }

    return null;
  };

  const handleCreateEntry = async () => {
    if (!user || userRole !== 'professor') {
      setError('Only professors can create calendar entries');
      return;
    }

    // Validate form fields first
    if (!validateForm()) {
      return;
    }

    // Validate time slots
    const validationError = validateTimeSlots(newEntry.startTime, newEntry.endTime, newEntry.duration);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const timeSlots = generateTimeSlots(newEntry.startTime, newEntry.endTime, newEntry.duration);
      const professor = professors.find(p => p.id === user.uid);
      
      if (!professor) {
        setError('Professor information not found');
        return;
      }

      // Create entries for all time slots
      for (const timeSlot of timeSlots) {
        const newEntryData = {
          professorId: user.uid,
          professorName: professor.displayName || professor.email,
          date: Timestamp.fromDate(new Date(newEntry.date)),
          timeSlot,
          tutorResponses: {},
          confirmation: {
            selectedTutorId: null,
            tutorAcknowledged: false,
            timestamp: null,
            status: 'pending'
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'calendarEntries'), newEntryData);

        // Add new entry to local state and sort by date
        setEntries(prev => {
          const newEntry = {
            id: docRef.id,
            ...newEntryData,
            // Convert serverTimestamp() to current timestamp for immediate display
            createdAt: Timestamp.fromDate(new Date()),
            updatedAt: Timestamp.fromDate(new Date())
          } as CalendarEntry;
          
          const updatedEntries = [...prev, newEntry];
          // Sort by date, and then by start time for same dates
          return updatedEntries.sort((a, b) => {
            const dateComparison = a.date.toMillis() - b.date.toMillis();
            if (dateComparison === 0) {
              // If same date, sort by start time
              return a.timeSlot.start.localeCompare(b.timeSlot.start);
            }
            return dateComparison;
          });
        });

        // Set up temporary listener for real-time updates
        setupTemporaryListener(docRef.id);
      }

      setIsAddingEntry(false);
      setNewEntry({ 
        date: '', 
        startTime: '', 
        endTime: '', 
        duration: 30 
      });
    } catch (error) {
      console.error('Error creating entries:', error);
      setError('Failed to create entries');
    }
  };

  // Pass setupTemporaryListener to CalendarGrid
  const handleEntryUpdate = (entryId: string) => {
    setupTemporaryListener(entryId);
  };

  // Update last viewed timestamp
  useEffect(() => {
    if (!user) return;

    const updateLastViewed = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          lastCalendarView: Timestamp.fromDate(new Date())
        });
      } catch (error) {
        console.error('Error updating last calendar view:', error);
      }
    };

    updateLastViewed();
  }, [user]);

  // Filter entries based on view toggle
  const filteredEntries = useMemo(() => {
    if (userRole !== 'professor' || showAllEntries) {
      return entries;
    }
    return entries.filter(entry => entry.professorId === user?.uid);
  }, [entries, userRole, showAllEntries, user?.uid]);

  // Group entries by professor
  const entriesByProfessor = useMemo(() => {
    return filteredEntries.reduce((acc, entry) => {
      if (!acc[entry.professorId]) {
        acc[entry.professorId] = [];
      }
      acc[entry.professorId].push(entry);
      return acc;
    }, {} as { [key: string]: CalendarEntry[] });
  }, [filteredEntries]);

  if (loading || !tutors.length || !professors.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-900 mb-2">Loading calendar...</div>
          <div className="text-sm text-gray-500">Please wait while we fetch the data.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left sidebar with overviews */}
      <div className="flex-none">
        {/* Tutor Hours Overview */}
        {!loading && tutors.length > 0 && (
          <div className="sticky top-4">
            <TutorHoursOverview entries={entries} tutors={tutors} />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Exam Calendar</h1>
          {userRole === 'professor' && (
            <button
              onClick={() => setIsAddingEntry(true)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Add Time Slot
            </button>
          )}
        </div>

        {/* Color Legend */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Legend</h2>
          <div className="grid grid-cols-5 gap-4">
            {Object.entries(STATUS_COLORS)
              .filter(([status]) => status !== 'pending')
              .map(([status, color]) => (
                <div key={status} className="flex items-center space-x-2">
                  <div 
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-gray-600 capitalize">
                    {status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* View Toggle */}
        {userRole === 'professor' && (
          <div className="flex justify-center items-center gap-2">
            <span className="text-sm text-gray-600">
              {showAllEntries ? 'All Entries' : 'My Entries'}
            </span>
            <button
              onClick={() => setShowAllEntries(!showAllEntries)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                showAllEntries ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showAllEntries ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Add Entry Dialog */}
        <Dialog
          open={isAddingEntry}
          onClose={() => setIsAddingEntry(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="mx-auto max-w-md rounded-lg bg-white p-6">
              <Dialog.Title className="text-lg font-medium mb-4">Add New Time Slots</Dialog.Title>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newEntry.date}
                    onChange={(e) => {
                      setNewEntry(prev => ({ ...prev, date: e.target.value }));
                      setFormErrors(prev => ({ ...prev, date: undefined }));
                    }}
                    className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${
                      formErrors.date 
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                        : 'border-gray-300'
                    }`}
                    required
                  />
                  {formErrors.date && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.date}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 flex space-x-2">
                    <select
                      value={parseTimeValue(newEntry.startTime).hour}
                      onChange={(e) => {
                        handleTimeChange('start', 'hour', Number(e.target.value));
                        setFormErrors(prev => ({ ...prev, startTime: undefined }));
                      }}
                      className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${
                        formErrors.startTime 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">Hour</option>
                      {hours.map(hour => (
                        <option key={hour} value={hour}>{hour.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                    <select
                      value={parseTimeValue(newEntry.startTime).minute}
                      onChange={(e) => {
                        handleTimeChange('start', 'minute', Number(e.target.value));
                        setFormErrors(prev => ({ ...prev, startTime: undefined }));
                      }}
                      className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${
                        formErrors.startTime 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">Minute</option>
                      {minutes.map(minute => (
                        <option key={minute} value={minute}>{minute.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                  {formErrors.startTime && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.startTime}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    End Time <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 flex space-x-2">
                    <select
                      value={parseTimeValue(newEntry.endTime).hour}
                      onChange={(e) => {
                        handleTimeChange('end', 'hour', Number(e.target.value));
                        setFormErrors(prev => ({ ...prev, endTime: undefined }));
                      }}
                      className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${
                        formErrors.endTime 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">Hour</option>
                      {hours.map(hour => (
                        <option key={hour} value={hour}>{hour.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                    <select
                      value={parseTimeValue(newEntry.endTime).minute}
                      onChange={(e) => {
                        handleTimeChange('end', 'minute', Number(e.target.value));
                        setFormErrors(prev => ({ ...prev, endTime: undefined }));
                      }}
                      className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${
                        formErrors.endTime 
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                          : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">Minute</option>
                      {minutes.map(minute => (
                        <option key={minute} value={minute}>{minute.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                  {formErrors.endTime && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.endTime}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                  <div className="flex space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio h-4 w-4 text-indigo-600"
                        checked={newEntry.duration === 30}
                        onChange={() => setNewEntry(prev => ({ ...prev, duration: 30 }))}
                      />
                      <span className="ml-2">30 minutes</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        className="form-radio h-4 w-4 text-indigo-600"
                        checked={newEntry.duration === 60}
                        onChange={() => setNewEntry(prev => ({ ...prev, duration: 60 }))}
                      />
                      <span className="ml-2">60 minutes</span>
                    </label>
                  </div>
                </div>

                {/* Preview Section */}
                {newEntry.startTime && newEntry.endTime && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preview of Time Slots
                    </label>
                    <div className="bg-gray-50 rounded-md p-3 max-h-48 overflow-y-auto">
                      {(() => {
                        const validationError = validateTimeSlots(
                          newEntry.startTime,
                          newEntry.endTime,
                          newEntry.duration
                        );
                        
                        if (validationError) {
                          return (
                            <p className="text-red-600 text-sm">{validationError}</p>
                          );
                        }

                        const slots = generateTimeSlots(
                          newEntry.startTime,
                          newEntry.endTime,
                          newEntry.duration
                        );

                        if (slots.length === 0) {
                          return (
                            <p className="text-gray-500 text-sm italic">
                              No valid time slots in the selected range
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-1">
                            <p className="text-sm text-gray-500 mb-2">
                              {slots.length} time slot{slots.length !== 1 ? 's' : ''} will be created:
                            </p>
                            {slots.map((slot, index) => (
                              <div
                                key={index}
                                className="text-sm text-gray-600 flex justify-between items-center py-1 px-2 hover:bg-gray-100 rounded"
                              >
                                <span>{`${index + 1}.`}</span>
                                <span>{`${slot.start} - ${slot.end}`}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-2 mt-6">
                  <button
                    onClick={() => setIsAddingEntry(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateEntry}
                    disabled={!newEntry.date || !newEntry.startTime || !newEntry.endTime}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      !newEntry.date || !newEntry.startTime || !newEntry.endTime
                        ? 'bg-indigo-300 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    } text-white`}
                  >
                    Create
                  </button>
                </div>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Calendar Grids by Professor */}
        <div className="space-y-8">
          {Object.entries(entriesByProfessor).map(([professorId, profEntries]) => {
            const professor = professors.find(p => p.id === professorId);
            return (
              <div key={professorId} className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-medium">{professor?.displayName || professor?.email}</h2>
                </div>
                <div className="p-6">
                  <CalendarGrid 
                    entries={profEntries} 
                    tutors={tutors}
                    professorId={professorId}
                    onEntryUpdate={handleEntryUpdate}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}