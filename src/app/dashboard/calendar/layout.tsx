'use client';

import { redirect } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    redirect('/');
  }

  return <>{children}</>;
} 