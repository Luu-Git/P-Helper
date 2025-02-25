'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Professor {
  id: string;
  name: string;
  displayOrder: number;
}

// Initial professor data - this will be stored in Firestore
export const INITIAL_PROFESSORS: Professor[] = [
  { id: 'scott', name: 'Prof. Scott', displayOrder: 1 },
  { id: 'phillips', name: 'Prof. Phillips', displayOrder: 2 },
  { id: 'wally', name: 'Prof. Wally', displayOrder: 3 },
  { id: 'elicker', name: 'Prof. Elicker', displayOrder: 4 },
  { id: 'fromm', name: 'Prof. Fromm', displayOrder: 5 },
  { id: 'eibinger', name: 'Prof. Eibinger', displayOrder: 6 },
];

export default function ProfessorGrid() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError('Failed to load professors');
        // Fallback to initial data if fetch fails
        setProfessors(INITIAL_PROFESSORS);
      } finally {
        setLoading(false);
      }
    };

    fetchProfessors();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-500">Loading professors...</div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {professors.map((professor) => (
        <Link
          key={professor.id}
          href={`/dashboard/professor/${professor.id}`}
          className="group relative bg-white overflow-hidden shadow-lg rounded-lg hover:shadow-xl transition-shadow duration-300 ease-in-out"
        >
          <div className="aspect-w-16 aspect-h-9 flex items-center justify-center p-6 border-4 border-transparent group-hover:border-indigo-500 transition-colors duration-300">
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors duration-300">
                {professor.name}
              </h3>
              <p className="mt-2 text-sm text-gray-500">View Students</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
} 