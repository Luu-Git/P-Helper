'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import TutorNote from './TutorNote';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

interface Note {
  content: string;
  tutorId: string;
  tutorName: string;
  timestamp: Date | FirestoreTimestamp;
  columnIndex: number;
}

interface Student {
  id: string;
  name: string;
  attendance: number;
  notes?: {
    [columnIndex: number]: Note[];
  };
  professorId: string;
}

interface Tutor {
  id: string;
  email: string;
  displayName: string;
  columnIndex: number;
}

interface StudentListProps {
  students: Student[];
  onStudentUpdate: (updatedStudent: Student) => void;
  highlightStudentId?: string | null;
}

interface NoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  initialContent?: string;
  studentName: string;
}

// Color coding based on attendance
function getAttendanceColor(attendance: number): string {
  if (attendance < 3) return '#9d9d9d';
  if (attendance < 5) return '#1eff00';
  if (attendance < 7) return '#0070dd';
  if (attendance < 10) return '#a335ee';
  return '#ff8000';
}

// Animation duration in milliseconds
const ANIMATION_DURATION = 500;

// Tutor names mapping
const TUTOR_NAMES = ['Lukas', 'Izaak', 'Anna-May', 'Laura'];

function NoteDialog({ isOpen, onClose, onSave, initialContent = '', studentName }: NoteDialogProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset content when dialog opens with new student
  useEffect(() => {
    setContent(initialContent || '');
  }, [initialContent, isOpen]);

  // Focus the textarea when dialog opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to ensure the dialog is fully rendered
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          // Place cursor at the end of the text
          const length = textarea.value.length;
          textarea.setSelectionRange(length, length);
        }
      }, 50);
    }
  }, [isOpen]);

  const insertSymbol = (symbol: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newContent = content.substring(0, start) + symbol + content.substring(end);
      setContent(newContent);
      // After state update, set cursor position after the inserted symbol
      setTimeout(() => {
        textareaRef.current?.focus();
        const newPosition = start + symbol.length;
        textareaRef.current?.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  };

  const ipaSymbols = ['tʃ', 'dʒ', 'θ', 'ð', 'ɹ', 'ʀ', 'z'];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title className="text-lg font-medium leading-6 text-gray-900">
                  Add Note for {studentName}
                </Dialog.Title>
                <div className="mt-4">
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Add your note here..."
                    rows={4}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ipaSymbols.map((symbol) => (
                      <button
                        key={symbol}
                        onClick={() => insertSymbol(symbol)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm font-mono"
                        title={`Insert ${symbol}`}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-end space-x-2">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    onClick={() => {
                      onSave(content);
                      onClose();
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default function StudentList({ students, onStudentUpdate, highlightStudentId }: StudentListProps) {
  const { user } = useAuth();
  const [animatingAttendance, setAnimatingAttendance] = useState<{[key: string]: number}>({});
  const [expandedNote, setExpandedNote] = useState<{studentId: string, columnIndex: number} | null>(null);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedStudent, setHighlightedStudent] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{
    isOpen: boolean;
    studentId: string;
    columnIndex: number;
    studentName: string;
    initialContent?: string;
  }>({
    isOpen: false,
    studentId: '',
    columnIndex: 0,
    studentName: '',
  });

  // Set up the highlight effect when highlightStudentId changes
  useEffect(() => {
    if (highlightStudentId) {
      setHighlightedStudent(highlightStudentId);
      
      // Remove the highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedStudent(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [highlightStudentId]);

  useEffect(() => {
    const fetchTutors = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'tutor')
        );
        const snapshot = await getDocs(q);
        const tutorData = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Tutor))
          .filter(tutor => tutor.columnIndex !== undefined)
          .sort((a, b) => a.columnIndex - b.columnIndex);
        
        setTutors(tutorData);
      } catch (error) {
        console.error('Error fetching tutors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTutors();
  }, []);

  const handleAttendanceChange = async (student: Student, change: number) => {
    const newAttendance = Math.max(0, student.attendance + change);
    
    // Start animation
    setAnimatingAttendance(prev => ({
      ...prev,
      [student.id]: student.attendance
    }));

    // Animate the number
    const startTime = Date.now();
    const startValue = student.attendance;
    const endValue = newAttendance;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Easing function for smooth animation
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;

      setAnimatingAttendance(prev => ({
        ...prev,
        [student.id]: current
      }));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete
        setAnimatingAttendance(prev => {
          const newState = { ...prev };
          delete newState[student.id];
          return newState;
        });
      }
    };

    requestAnimationFrame(animate);

    // Update Firestore
    try {
      await updateDoc(doc(db, 'students', student.id), {
        attendance: newAttendance
      });

      onStudentUpdate({
        ...student,
        attendance: newAttendance
      });
    } catch (error) {
      console.error('Error updating attendance:', error);
      setAnimatingAttendance(prev => {
        const newState = { ...prev };
        delete newState[student.id];
        return newState;
      });
    }
  };

  const handleAddOrUpdateNote = async (content: string) => {
    if (!user || !content.trim()) return;

    try {
      const studentRef = doc(db, 'students', noteDialog.studentId);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) {
        console.error('Student not found');
        return;
      }

      const newNote: Note = {
        content: content.trim(),
        tutorId: user.uid,
        tutorName: user.displayName || user.email || 'Unknown Tutor',
        timestamp: new Date(),
        columnIndex: noteDialog.columnIndex
      };

      // Replace existing notes for this column
      await updateDoc(studentRef, {
        [`notes.${noteDialog.columnIndex}`]: [newNote]
      });

      const student = students.find(s => s.id === noteDialog.studentId);
      if (student) {
        const updatedStudent = {
          ...student,
          notes: {
            ...student.notes,
            [noteDialog.columnIndex]: [newNote]
          }
        };
        onStudentUpdate(updatedStudent);
      }
    } catch (error) {
      console.error('Error adding/updating note:', error);
    }
  };

  // Define highlight animation class
  const highlightClass = "bg-blue-100 transition-colors duration-300";

  if (loading) {
    return <div>Loading tutors...</div>;
  }

  // Create an array of tutor names for each column
  const tutorColumns = Array(4).fill(null).map((_, index) => 
    tutors.find(t => t.columnIndex === index)?.displayName || `Column ${index + 1}`
  );

  return (
    <div className="relative">
      {/* Tutor Names Header */}
      <div className="grid grid-cols-[350px,80px,1fr] gap-4 mb-2">
        <div className="text-sm font-medium text-gray-500">Student Name</div>
        <div className="text-sm font-medium text-gray-500 text-center">Attendance</div>
        <div className="grid grid-cols-4 gap-4">
          {tutorColumns.map((name, index) => (
            <div key={index} className="text-sm font-medium text-gray-500 text-center">
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* Student List */}
      <div className="space-y-2">
        {students.map((student, index) => {
          const displayAttendance = student.id in animatingAttendance
            ? Math.round(animatingAttendance[student.id] * 10) / 10
            : student.attendance;
          
          return (
            <div 
              key={student.id} 
              className={`grid grid-cols-[350px,80px,1fr] gap-4 items-center ${
                index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
              } hover:bg-indigo-50 transition-colors duration-150 rounded-lg ${
                highlightedStudent === student.id ? highlightClass : ''
              }`}
            >
              {/* Student Name */}
              <div className="p-3 font-medium text-gray-900">{student.name}</div>

              {/* Attendance Controls */}
              <div className="flex items-center justify-center space-x-1">
                <button
                  onClick={() => handleAttendanceChange(student, -1)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm"
                >
                  -
                </button>
                
                <span 
                  className="w-8 text-center font-bold text-sm"
                  style={{ color: getAttendanceColor(displayAttendance) }}
                >
                  {displayAttendance}
                </span>

                <button
                  onClick={() => handleAttendanceChange(student, 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-green-100 text-green-600 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-sm"
                >
                  +
                </button>
              </div>

              {/* Tutor Notes Grid */}
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((columnIndex) => {
                  const notes = student.notes?.[columnIndex] || [];
                  const latestNote = notes[notes.length - 1];
                  const assignedTutor = tutors.find(t => t.columnIndex === columnIndex);
                  const isAssignedColumn = assignedTutor?.id === user?.uid;

                  return (
                    <div
                      key={columnIndex}
                      className="relative"
                      onMouseEnter={() => notes.length > 0 && setExpandedNote({ studentId: student.id, columnIndex })}
                      onMouseLeave={() => setExpandedNote(null)}
                    >
                      <div 
                        className={`min-h-[2.5rem] h-[2.5rem] rounded p-2 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        } ${isAssignedColumn ? 'cursor-pointer hover:bg-indigo-50' : ''}`}
                        onClick={() => {
                          if (isAssignedColumn) {
                            setNoteDialog({
                              isOpen: true,
                              studentId: student.id,
                              columnIndex,
                              studentName: student.name,
                              initialContent: latestNote?.content || ''
                            });
                          }
                        }}
                      >
                        {latestNote ? (
                          <div className="text-sm text-gray-600 truncate">
                            {latestNote.content}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 italic truncate">
                            {isAssignedColumn ? 'Click to add note' : 'No notes'}
                          </div>
                        )}
                      </div>

                      {expandedNote?.studentId === student.id && 
                       expandedNote?.columnIndex === columnIndex && 
                       notes.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white shadow-lg rounded-lg p-4 border border-gray-200 max-h-48 overflow-y-auto">
                          {notes.map((note, index) => (
                            <div key={index} className="text-sm text-gray-600 mb-2 pb-2 border-b border-gray-100 last:border-0">
                              <div className="mt-1">{note.content}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                {note.timestamp instanceof Date 
                                  ? note.timestamp.toLocaleDateString()
                                  : new Date(note.timestamp.seconds * 1000).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <NoteDialog
        isOpen={noteDialog.isOpen}
        onClose={() => setNoteDialog(prev => ({ ...prev, isOpen: false }))}
        onSave={handleAddOrUpdateNote}
        initialContent={noteDialog.initialContent}
        studentName={noteDialog.studentName}
      />
    </div>
  );
} 