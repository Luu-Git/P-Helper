'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { INITIAL_PROFESSORS } from '@/app/components/ProfessorGrid';
import StudentList from '@/app/components/StudentList';
import Link from 'next/link';

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
}

export default function ProfessorPage() {
  const params = useParams();
  const professorId = params.id as string;
  const [professor, setProfessor] = useState(INITIAL_PROFESSORS.find(p => p.id === professorId));
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');

  useEffect(() => {
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
        } as Student));
        setStudents(fetchedStudents);
      } catch (err) {
        console.error('Error fetching students:', err);
        setError('Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [professorId]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;

    try {
      const studentDoc = await addDoc(collection(db, 'students'), {
        name: newStudentName.trim(),
        professorId,
        attendance: 0,
        createdAt: new Date(),
      });

      const newStudent: Student = {
        id: studentDoc.id,
        name: newStudentName.trim(),
        attendance: 0,
      };

      setStudents(prev => [...prev, newStudent]);
      setNewStudentName('');
      setIsAddingStudent(false);
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
    <div className="flex gap-4">
      {/* Professor Navigation Sidebar - Made narrower */}
      <div className="w-40 flex-shrink-0">
        <div className="bg-white shadow rounded-lg p-3">
          <h2 className="text-xs font-medium text-gray-500 mb-3">Quick Navigation</h2>
          <nav className="space-y-1">
            {INITIAL_PROFESSORS.map((prof) => (
              <Link
                key={prof.id}
                href={`/dashboard/professor/${prof.id}`}
                className={`block px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  prof.id === professorId
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {prof.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content - Expanded width */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">{professor?.name}'s Students</h1>
          {!isAddingStudent ? (
            <button
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={() => setIsAddingStudent(true)}
            >
              Add Student
            </button>
          ) : (
            <form onSubmit={handleAddStudent} className="flex items-center space-x-2">
              <input
                type="text"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Student name"
                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingStudent(false);
                  setNewStudentName('');
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </form>
          )}
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

        <div className="bg-white shadow rounded-lg">
          <div className="p-4">
            {students.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No students found. Click "Add Student" to get started.
              </div>
            ) : (
              <StudentList 
                students={students}
                onStudentUpdate={handleStudentUpdate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 