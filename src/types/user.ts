/**
 * User type definition for the application
 */
export interface User {
  id?: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'professor' | 'tutor' | 'student';
  lastCalendarView?: any; // Using any for timestamp compatibility
  createdAt?: any;
  updatedAt?: any;
  columnIndex?: number;
} 