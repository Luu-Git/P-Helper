'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CalendarEntry } from '@/types/calendar';
import { checkTutorNotifications, checkProfessorNotifications } from '@/lib/calendarNotifications';
import { Timestamp } from 'firebase/firestore';
import Footer from '@/components/Footer';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  columnIndex?: number;
  lastCalendarView: any;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, userRole, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showCalendarNotification, setShowCalendarNotification] = useState(false);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [tutors, setTutors] = useState<User[]>([]);

  // Fetch calendar entries and set up listener
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'calendarEntries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CalendarEntry));
      setEntries(newEntries);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch tutors
  useEffect(() => {
    const fetchTutors = async () => {
      const q = query(collection(db, 'users'), where('role', '==', 'tutor'));
      const snapshot = await getDocs(q);
      const tutorData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
      setTutors(tutorData);
    };

    fetchTutors();
  }, []);

  // Check for notifications
  useEffect(() => {
    if (!user || !userRole || entries.length === 0) return;

    const checkNotifications = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data() as User;
        const lastViewed = userData?.lastCalendarView;

        if (userRole === 'tutor') {
          // Show notification if there are any unhandled entries
          const hasUnhandledEntries = entries.some(entry => {
            // New unresponded entries
            const hasNotResponded = !entry.tutorResponses[user.uid];
            
            // Selected by professor but not acknowledged
            const isSelectedNotAcknowledged = 
              entry.confirmation.selectedTutorId === user.uid && 
              !entry.confirmation.tutorAcknowledged;
            
            // Entry within next 24 hours without response
            const isUrgent = isWithinNextHours(entry.date, 24) && !entry.tutorResponses[user.uid];
            
            return hasNotResponded || isSelectedNotAcknowledged || isUrgent;
          });

          setShowCalendarNotification(hasUnhandledEntries);
        } else if (userRole === 'professor') {
          // Show notification if there are entries needing attention
          const hasUnhandledEntries = entries.some(entry => {
            if (entry.professorId !== user.uid) return false;

            // Only show notification if all tutors have responded but no tutor selected
            const allTutorsResponded = tutors.every(tutor => 
              entry.tutorResponses[tutor.id] !== undefined
            );
            return allTutorsResponded && 
              !entry.confirmation.selectedTutorId &&
              Object.values(entry.tutorResponses).length === tutors.length;
          });

          setShowCalendarNotification(hasUnhandledEntries);
        }
      } catch (error) {
        console.error('Error checking notifications:', error);
      }
    };

    checkNotifications();
  }, [user, userRole, entries, tutors]);

  function isWithinNextHours(date: Timestamp, hours: number): boolean {
    const now = new Date();
    const entryDate = date.toDate();
    const hoursDiff = (entryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursDiff >= 0 && hoursDiff <= hours;
  }

  const navigation = [
    { name: 'Students', href: '/dashboard' },
    { 
      name: 'Calendar', 
      href: '/dashboard/calendar',
      showNotification: showCalendarNotification
    },
    { name: 'Admin', href: '/dashboard/admin', requiresAdmin: true },
  ];

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold text-indigo-600">Pronunciation Helper</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => {
                  const isDisabled = item.requiresAdmin && userRole !== 'admin';
                  return (
                    <div key={item.name} className="relative inline-flex items-center">
                      <Link
                        href={isDisabled ? '#' : item.href}
                        className={`${
                          pathname === item.href
                            ? 'border-indigo-500 text-gray-900'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        } ${
                          isDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-16`}
                        onClick={(e) => {
                          if (isDisabled) {
                            e.preventDefault();
                          }
                        }}
                      >
                        {item.name}
                      </Link>
                      {item.showNotification && (
                        <span className="absolute top-3 right-0 -mr-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-gray-700 text-sm mr-4">
                {user?.email} ({userRole})
              </span>
              <button
                onClick={handleSignOut}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      
      <Footer />
    </div>
  );
} 