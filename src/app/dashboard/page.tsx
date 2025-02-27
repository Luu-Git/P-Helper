'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import ProfessorGrid from '@/app/components/ProfessorGrid';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { INITIAL_PROFESSORS } from '@/app/components/ProfessorGrid';
import Link from 'next/link';
import { useDebounce } from '@/lib/hooks';

interface Student {
  id: string;
  name: string;
  attendance: number;
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

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StudentsByProfessor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [professors, setProfessors] = useState<Professor[]>([]);
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

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

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Student Management</h1>
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

      {debouncedSearchTerm && debouncedSearchTerm.length >= 3 ? (
        <div className="bg-white shadow rounded-lg p-6">
          {isSearching ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
              <p className="mt-2 text-gray-500">Searching...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-500">No students found matching &quot{debouncedSearchTerm}&quot</p>
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
                        >
                          <span className="text-gray-900">{student.name}</span>
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
        <div className="bg-white shadow rounded-lg p-6">
          <ProfessorGrid />
        </div>
      )}
    </div>
  );
} 