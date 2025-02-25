'use client';

import { CalendarEntry } from '@/types/calendar';

interface User {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  columnIndex?: number;
}

interface TutorHoursOverviewProps {
  entries: CalendarEntry[];
  tutors: User[];
}

export default function TutorHoursOverview({ entries, tutors }: TutorHoursOverviewProps) {
  const calculateTutorHours = (tutorId: string) => {
    return entries.reduce((total, entry) => {
      // Only count if tutor has acknowledged this time slot
      if (
        entry.confirmation.selectedTutorId === tutorId &&
        entry.confirmation.tutorAcknowledged
      ) {
        // Calculate hours from time slot
        const [startHour, startMinute] = entry.timeSlot.start.split(':').map(Number);
        const [endHour, endMinute] = entry.timeSlot.end.split(':').map(Number);
        
        const hours = (endHour + endMinute/60) - (startHour + startMinute/60);
        return total + hours;
      }
      return total;
    }, 0);
  };

  // Sort tutors by their assigned hours (descending)
  const tutorsWithHours = tutors
    .map(tutor => ({
      ...tutor,
      hours: calculateTutorHours(tutor.id)
    }))
    .sort((a, b) => b.hours - a.hours);

  return (
    <div className="bg-white shadow rounded-lg p-4 w-60">
      <h2 className="text-xs font-medium text-gray-500 uppercase mb-4">Tutor Hours Overview</h2>
      <div className="space-y-3">
        {tutorsWithHours.map(tutor => (
          <div key={tutor.id} className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              {tutor.displayName || tutor.email}
            </span>
            <span className="text-sm text-gray-500">
              {tutor.hours.toFixed(1)}h
            </span>
          </div>
        ))}
      </div>
    </div>
  );
} 