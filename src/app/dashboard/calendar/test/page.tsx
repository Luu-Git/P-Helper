'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  onSnapshot,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CalendarEntry, TimeSlot } from '@/types/calendar';

export default function CalendarTest() {
  const { user, userRole } = useAuth();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Test creating a new calendar entry
  const createTestEntry = async () => {
    if (!user || userRole !== 'professor') {
      setError('Only professors can create calendar entries');
      return;
    }

    try {
      const timeSlot: TimeSlot = {
        start: "09:00",
        end: "10:00"
      };

      const newEntry = {
        professorId: user.uid,
        date: Timestamp.fromDate(new Date()),
        timeSlot,
        tutorResponses: {},
        confirmation: {
          selectedTutorId: null,
          tutorAcknowledged: false,
          timestamp: null
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'calendarEntries'), newEntry);
      console.log('Test entry created successfully');
    } catch (err) {
      console.error('Error creating test entry:', err);
      setError('Failed to create test entry');
    }
  };

  // Listen for calendar entries
  useEffect(() => {
    const q = query(
      collection(db, 'calendarEntries'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const newEntries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CalendarEntry));
        setEntries(newEntries);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching calendar entries:', error);
        setError('Failed to fetch calendar entries');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading calendar entries...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Calendar Data Structure Test</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <button
          onClick={createTestEntry}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Create Test Entry
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Entries:</h2>
        {entries.map((entry) => (
          <div key={entry.id} className="border rounded p-4 bg-white shadow">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(entry, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
} 