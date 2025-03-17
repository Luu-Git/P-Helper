'use client';

import { useEffect, useState, Fragment } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { INITIAL_PROFESSORS } from '@/app/components/ProfessorGrid';
import StudentList from '@/app/components/StudentList';
import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import { useDebounce } from '@/lib/hooks';
import { TrashIcon } from '@heroicons/react/24/outline';
import ExcelImportDialog from '@/app/components/ExcelImportDialog';
import { formatNameLastFirst } from '@/lib/utils';

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

interface Professor {
  id: string;
  name: string;
  displayOrder: number;
}

interface StudentsByProfessor {
  professor: Professor;
  students: Student[];
}

export default function ProfessorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const professorId = params.id as string;
  const highlightStudentId = searchParams.get('highlightStudent');
  const [professor, setProfessor] = useState(INITIAL_PROFESSORS.find(p => p.id === professorId));
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StudentsByProfessor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // State for add dialogs
  const [isOptionsDialogOpen, setIsOptionsDialogOpen] = useState(false);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isExcelImportDialogOpen, setIsExcelImportDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [formErrors, setFormErrors] = useState({
    firstName: '',
    lastName: ''
  });

  // State for delete dialogs
  const [isDeleteOptionsDialogOpen, setIsDeleteOptionsDialogOpen] = useState(false);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [isDeleteSingleDialogOpen, setIsDeleteSingleDialogOpen] = useState(false);
  const [isDeleteConfirmDialogOpen, setIsDeleteConfirmDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Function to fetch students
  const fetchStudents = async () => {
    try {
      const q = query(
        collection(db, 'students'),
        where('professorId', '==', professorId)
      );
      const snapshot = await getDocs(q);
      const fetchedStudents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Student))
      .sort((a, b) => {
        // Extract last name (assuming the last word in the name is the last name)
        const lastNameA = a.name.split(' ').pop() || '';
        const lastNameB = b.name.split(' ').pop() || '';
        
        // Sort by last name
        return lastNameA.localeCompare(lastNameB);
      });
      setStudents(fetchedStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Fetch professors once
  useEffect(() => {
    const fetchProfessors = async () => {
      try {
        const professorsCollection = collection(db, 'professors');
        const snapshot = await getDocs(professorsCollection);
        
        if (snapshot.empty) {
          // If no professors exist yet, use initial data
          setProfessors(INITIAL_PROFESSORS);
        } else {
          const fetchedProfessors = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Professor));
          setProfessors(fetchedProfessors.sort((a, b) => a.displayOrder - b.displayOrder));
        }
      } catch (err) {
        console.error('Error fetching professors:', err);
        // Fallback to initial data if fetch fails
        setProfessors(INITIAL_PROFESSORS);
      }
    };

    fetchProfessors();
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [professorId]);

  // Search for students when search term changes
  useEffect(() => {
    const searchStudents = async () => {
      if (!debouncedSearchTerm || debouncedSearchTerm.length < 3) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const studentsCollection = collection(db, 'students');
        const searchTermLower = debouncedSearchTerm.toLowerCase();
        
        // Get all students (we'll filter client-side since Firestore doesn't support case-insensitive search)
        const snapshot = await getDocs(studentsCollection);
        
        // Filter students whose names contain the search term (case insensitive)
        const matchingStudents = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Student))
          .filter(student => 
            student.name.toLowerCase().includes(searchTermLower)
          );

        // Group students by professor
        const groupedResults: StudentsByProfessor[] = [];
        
        for (const professor of professors) {
          const studentsForProfessor = matchingStudents.filter(
            student => student.professorId === professor.id
          );
          
          if (studentsForProfessor.length > 0) {
            groupedResults.push({
              professor,
              students: studentsForProfessor
            });
          }
        }
        
        setSearchResults(groupedResults);
      } catch (err) {
        console.error('Error searching students:', err);
      } finally {
        setIsSearching(false);
      }
    };

    searchStudents();
  }, [debouncedSearchTerm, professors]);

  // Clear search when a student is highlighted
  useEffect(() => {
    if (highlightStudentId) {
      setSearchTerm('');
    }
  }, [highlightStudentId]);

  const validateForm = () => {
    const errors = {
      firstName: '',
      lastName: ''
    };
    let isValid = true;

    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
      isValid = false;
    }

    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      const studentDoc = await addDoc(collection(db, 'students'), {
        name: fullName,
        professorId,
        attendance: 0,
        createdAt: new Date(),
      });

      const newStudent: Student = {
        id: studentDoc.id,
        name: fullName,
        attendance: 0,
        professorId,
      };

      setStudents(prev => [...prev, newStudent]);
      setFirstName('');
      setLastName('');
      setIsAddStudentDialogOpen(false);
    } catch (err) {
      console.error('Error adding student:', err);
      setError('Failed to add student');
    }
  };

  const handleStudentUpdate = (updatedStudent: Student) => {
    setStudents(prev =>
      prev.map(student =>
        student.id === updatedStudent.id ? updatedStudent : student
      )
    );
  };

  // Delete a single student
  const handleDeleteStudent = async (student: Student) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', student.id));
      setStudents(prev => prev.filter(s => s.id !== student.id));
      setStudentToDelete(null);
      setIsDeleteConfirmDialogOpen(false);
      setIsDeleteSingleDialogOpen(false);
    } catch (err) {
      console.error('Error deleting student:', err);
      setError('Failed to delete student');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete all students for the current professor
  const handleDeleteAllStudents = async () => {
    if (deleteConfirmText !== 'delete all students') {
      return;
    }

    setIsDeleting(true);
    try {
      // Delete each student document
      const deletePromises = students.map(student => 
        deleteDoc(doc(db, 'students', student.id))
      );
      
      await Promise.all(deletePromises);
      setStudents([]);
      setIsDeleteAllDialogOpen(false);
      setDeleteConfirmText('');
    } catch (err) {
      console.error('Error deleting all students:', err);
      setError('Failed to delete all students');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle successful Excel import
  const handleExcelImportSuccess = (count: number) => {
    // Refresh the student list by fetching students again
    try {
      const q = query(
        collection(db, 'students'),
        where('professorId', '==', professorId)
      );
      getDocs(q).then(snapshot => {
        const fetchedStudents = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Student));
        setStudents(fetchedStudents);
      }).catch(err => {
        console.error('Error fetching students after Excel import:', err);
        setError('Failed to refresh student list');
      });
    } catch (err) {
      console.error('Error setting up query after Excel import:', err);
      setError('Failed to refresh student list');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-500">Loading students...</div>
      </div>
    );
  }

  if (!professor) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">Professor not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-semibold text-gray-900 pl-1">{professor?.name}&apos;s Students</h1>
        <div className="flex items-center gap-3">
          <button
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            onClick={() => setIsDeleteOptionsDialogOpen(true)}
          >
            Delete Student(s)
          </button>
          <button
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={() => setIsOptionsDialogOpen(true)}
          >
            Add Student(s)
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="Search students..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </div>

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

      {debouncedSearchTerm && debouncedSearchTerm.length >= 3 ? (
        <div className="bg-white shadow rounded-lg p-6">
          {isSearching ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
              <p className="mt-2 text-gray-500">Searching...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-500">No students found matching &quot;{debouncedSearchTerm}&quot;</p>
            </div>
          ) : (
            <div className="space-y-6">
              {searchResults.map((result) => (
                <div key={result.professor.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                  <h2 className="text-xl font-medium text-gray-900 mb-3">{result.professor.name}</h2>
                  <ul className="divide-y divide-gray-200">
                    {result.students.map((student) => (
                      <li key={student.id} className="py-3">
                        <Link 
                          href={`/dashboard/professor/${result.professor.id}?highlightStudent=${student.id}`}
                          className="flex items-center justify-between hover:bg-gray-50 p-2 rounded-md"
                          onClick={() => {
                            // Clear search term immediately when clicked
                            setSearchTerm('');
                          }}
                        >
                          <span className="text-gray-900">{formatNameLastFirst(student.name)}</span>
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="mr-2">Attendance: {student.attendance}</span>
                            <svg className="h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg">
          <div className="p-3">
            {students.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No students found. Click &quot;Add Student(s)&quot; to get started.
              </div>
            ) : (
              <StudentList 
                students={students}
                onStudentUpdate={handleStudentUpdate}
                highlightStudentId={highlightStudentId}
              />
            )}
          </div>
        </div>
      )}

      {/* Options Dialog */}
      <Transition appear show={isOptionsDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsOptionsDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Add Student(s)
                  </Dialog.Title>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500">
                      Choose how you would like to add students to this professor.
                    </p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      className="inline-flex flex-col items-center justify-center rounded-md border border-transparent bg-amber-600 px-4 py-4 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsOptionsDialogOpen(false);
                        setIsExcelImportDialogOpen(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Multiple Students
                    </button>
                    <button
                      type="button"
                      className="inline-flex flex-col items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-4 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsOptionsDialogOpen(false);
                        setIsAddStudentDialogOpen(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Add a Single Student
                    </button>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsOptionsDialogOpen(false)}
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

      {/* Add Student Dialog */}
      <Transition appear show={isAddStudentDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsAddStudentDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Add a New Student
                  </Dialog.Title>
                  <form onSubmit={handleAddStudent}>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className={`mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm ${
                            formErrors.firstName ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {formErrors.firstName && (
                          <p className="mt-1 text-sm text-red-600">{formErrors.firstName}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={`mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm ${
                            formErrors.lastName ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {formErrors.lastName && (
                          <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-2">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        onClick={() => {
                          setIsAddStudentDialogOpen(false);
                          setFirstName('');
                          setLastName('');
                          setFormErrors({ firstName: '', lastName: '' });
                          setIsOptionsDialogOpen(true);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                      >
                        Add Student
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Delete Options Dialog */}
      <Transition appear show={isDeleteOptionsDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsDeleteOptionsDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Delete Student(s)
                  </Dialog.Title>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500">
                      Choose how you would like to delete students from this professor.
                    </p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      className="inline-flex flex-col items-center justify-center rounded-md border border-transparent bg-amber-600 px-4 py-4 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsDeleteOptionsDialogOpen(false);
                        setIsDeleteSingleDialogOpen(true);
                      }}
                    >
                      <TrashIcon className="h-6 w-6 mb-2" />
                      Delete a Single Student
                    </button>
                    <button
                      type="button"
                      className="inline-flex flex-col items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-4 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsDeleteOptionsDialogOpen(false);
                        setIsDeleteAllDialogOpen(true);
                      }}
                    >
                      <TrashIcon className="h-6 w-6 mb-2" />
                      Delete All Students
                    </button>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsDeleteOptionsDialogOpen(false)}
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

      {/* Delete All Students Confirmation Dialog */}
      <Transition appear show={isDeleteAllDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsDeleteAllDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Delete All Students
                  </Dialog.Title>
                  <div className="mt-4">
                    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <TrashIcon className="h-5 w-5 text-red-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-red-700">
                            Are you sure you want to delete all students for {professor?.name}? This action cannot be undone.
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      To confirm, please type &quot;delete all students&quot; in the field below:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="Type 'delete all students' to confirm"
                    />
                  </div>

                  <div className="mt-6 flex justify-end space-x-2">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => {
                        setIsDeleteAllDialogOpen(false);
                        setDeleteConfirmText('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleteConfirmText !== 'delete all students' || isDeleting}
                      className={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        deleteConfirmText === 'delete all students' && !isDeleting
                          ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                          : 'bg-red-300 cursor-not-allowed'
                      }`}
                      onClick={handleDeleteAllStudents}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete All Students'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Delete Single Student Dialog */}
      <Transition appear show={isDeleteSingleDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsDeleteSingleDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Delete a Student
                  </Dialog.Title>
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Select a student to delete from {professor?.name}&apos;s class:
                    </p>
                    <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-md">
                      {students.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No students to delete
                        </div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          {students.map((student) => (
                            <li key={student.id} className="p-3 hover:bg-gray-50">
                              <div className="flex items-center">
                                <button
                                  className="text-red-500 hover:text-red-700 group"
                                  onClick={() => {
                                    setStudentToDelete(student);
                                    setIsDeleteConfirmDialogOpen(true);
                                  }}
                                >
                                  <TrashIcon className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                </button>
                                <span className="ml-3 text-gray-900">{formatNameLastFirst(student.name)}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsDeleteSingleDialogOpen(false)}
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

      {/* Delete Single Student Confirmation Dialog */}
      <Transition appear show={isDeleteConfirmDialogOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => setIsDeleteConfirmDialogOpen(false)}>
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
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Confirm Deletion
                  </Dialog.Title>
                  <div className="mt-4">
                    <div className="bg-red-50 border-l-4 border-red-400 p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <TrashIcon className="h-5 w-5 text-red-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-red-700">
                            Are you sure you want to delete {studentToDelete && formatNameLastFirst(studentToDelete.name)}? This action cannot be undone.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end space-x-2">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                      onClick={() => setIsDeleteConfirmDialogOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      onClick={() => studentToDelete && handleDeleteStudent(studentToDelete)}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Student'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        isOpen={isExcelImportDialogOpen}
        onClose={() => setIsExcelImportDialogOpen(false)}
        professorId={professorId}
        onSuccess={handleExcelImportSuccess}
      />
    </div>
  );
} 