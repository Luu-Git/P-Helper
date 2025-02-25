import { Timestamp } from 'firebase/firestore';

export type AvailabilityStatus = 'available' | 'partial' | 'unavailable';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'acknowledged';

export interface TutorResponse {
  status: AvailabilityStatus;
  details?: string;  // For partial availability (e.g., "ab 11:30" or "until 12")
  lastUpdated: Timestamp;
}

export interface TimeSlot {
  start: string;  // 24hr format "HH:mm"
  end: string;    // 24hr format "HH:mm"
}

export interface Confirmation {
  selectedTutorId: string | null;
  tutorAcknowledged: boolean;
  timestamp: Timestamp | null;
  status: ConfirmationStatus;
}

export interface CalendarEntry {
  id: string;
  professorId: string;
  professorName: string;  // Added for easier display
  date: Timestamp;
  timeSlot: TimeSlot;
  tutorResponses: {
    [tutorId: string]: TutorResponse;
  };
  confirmation: Confirmation;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CalendarState {
  entries: { [professorId: string]: CalendarEntry[] };
  loading: boolean;
  error: string | null;
  activeEdits: { [entryId: string]: boolean };
  pendingChanges: { [entryId: string]: Partial<CalendarEntry> };
}

// Color coding constants
export const STATUS_COLORS = {
  available: '#1eff00',      // Green - "This works for me!"
  partial: '#ffff00',        // Yellow - "Yes, but not the whole time"
  unavailable: '#ff0000',    // Red - "Not possible"
  pending: '#ffffff',        // White - No response yet
  confirmed: '#0070dd',      // Blue - Professor confirmed
  acknowledged: '#a335ee',   // Purple - Tutor acknowledged
}; 