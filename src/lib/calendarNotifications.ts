import { Timestamp } from 'firebase/firestore';
import { CalendarEntry } from '@/types/calendar';

export function checkTutorNotifications(
  entries: CalendarEntry[],
  tutorId: string,
  lastViewed: Timestamp | null
): boolean {
  if (!lastViewed) return true; // If never viewed, show notification

  return entries.some(entry => {
    // New unresponded entries
    const isNewEntry = entry.createdAt.toMillis() > lastViewed.toMillis();
    const hasNotResponded = !entry.tutorResponses[tutorId];
    
    // Selected by professor but not acknowledged
    const isSelectedNotAcknowledged = 
      entry.confirmation.selectedTutorId === tutorId && 
      !entry.confirmation.tutorAcknowledged;
    
    // Entry within next 24 hours without response
    const isUrgent = isWithinNextHours(entry.date, 24) && !entry.tutorResponses[tutorId];
    
    // Was confirmed but entry was deleted (check updatedAt)
    const wasConfirmedThenDeleted = 
      entry.updatedAt.toMillis() > lastViewed.toMillis() &&
      entry.confirmation.selectedTutorId === tutorId;

    return (isNewEntry && hasNotResponded) || 
           isSelectedNotAcknowledged || 
           isUrgent ||
           wasConfirmedThenDeleted;
  });
}

export function checkProfessorNotifications(
  entries: CalendarEntry[],
  professorId: string,
  lastViewed: Timestamp | null,
  tutors: { id: string }[]
): boolean {
  if (!lastViewed) return true; // If never viewed, show notification

  return entries.some(entry => {
    if (entry.professorId !== professorId) return false;

    // Don't show notification for newly created entries by the professor
    const isNewEntry = entry.createdAt.toMillis() > lastViewed.toMillis();
    if (isNewEntry) return false;

    // Check if all tutors have responded
    const allTutorsResponded = tutors.every(tutor => 
      entry.tutorResponses[tutor.id] !== undefined
    );

    // Check if the last response that made all tutors respond was after last viewed
    const justGotAllResponses = allTutorsResponded && 
      Object.values(entry.tutorResponses).some(response => 
        response.lastUpdated.toMillis() > lastViewed.toMillis() &&
        // Check if before this response, not all tutors had responded
        Object.keys(entry.tutorResponses).length === tutors.length
      );

    // Tutor acknowledged confirmation
    const tutorAcknowledged = 
      entry.confirmation.tutorAcknowledged &&
      entry.updatedAt.toMillis() > lastViewed.toMillis();

    // New partial availability details
    const hasNewPartialDetails = Object.values(entry.tutorResponses).some(response =>
      response.status === 'partial' &&
      response.lastUpdated.toMillis() > lastViewed.toMillis()
    );

    return justGotAllResponses || 
           tutorAcknowledged || 
           hasNewPartialDetails;
  });
}

function isWithinNextHours(date: Timestamp, hours: number): boolean {
  const now = new Date();
  const entryDate = date.toDate();
  const hoursDiff = (entryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursDiff >= 0 && hoursDiff <= hours;
} 