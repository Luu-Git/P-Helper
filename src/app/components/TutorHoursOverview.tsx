'use client';

import { CalendarEntry } from '@/types/calendar';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

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
  const [showTooltip, setShowTooltip] = useState(false);
  
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
    <div className="bg-white shadow rounded-lg p-4 w-48">
      <div className="flex items-center mb-4 relative">
        <h2 className="text-xs font-medium text-gray-500 uppercase leading-tight">Tutor Hours Overview</h2>
        <div 
          className="ml-1 text-gray-400 hover:text-gray-600 cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <QuestionMarkCircleIcon className="h-5 w-5" />
          {showTooltip && (
            <div className="absolute z-10 w-52 p-2 bg-gray-800 text-white text-xs rounded shadow-lg -right-4 top-7">
              Only acknowledged hours are taken into account
              <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-800 transform rotate-45"></div>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {tutorsWithHours.map(tutor => (
          <div key={tutor.id} className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 truncate mr-2">
              {tutor.displayName || tutor.email}
            </span>
            <span className="text-sm text-gray-500 flex-shrink-0">
              {tutor.hours.toFixed(1)}h
            </span>
          </div>
        ))}
      </div>
    </div>
  );
} 