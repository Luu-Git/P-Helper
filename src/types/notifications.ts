import { Timestamp } from 'firebase/firestore';

/**
 * Scenario types for email notifications
 */
export enum NotificationScenario {
  NEW_TIME_SLOTS = 1,
  TUTOR_SELECTED = 2,
  ALL_TUTORS_RESPONDED = 3,
  TUTOR_ACKNOWLEDGED = 4
}

/**
 * Time slot details for notifications
 */
export interface NotificationTimeSlot {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Notification database structure
 */
export interface PendingNotification {
  id?: string;
  scenario: NotificationScenario;
  recipientIds: string[];
  timeSlotIds: string[];
  timeSlotDetails?: NotificationTimeSlot[];
  professorId?: string;
  professorName?: string;
  tutorId?: string;
  tutorName?: string;
  created: Date | string;
  processed?: boolean;
  processedAt?: Date | string;
}

/**
 * Group of notifications by scenario
 */
export interface RecipientNotifications {
  scenario: NotificationScenario;
  notifications: PendingNotification[];
}

/**
 * Notifications grouped by recipient and scenario
 */
export interface GroupedNotifications {
  [recipientId: string]: {
    [scenario: number]: RecipientNotifications;
  }
}

/**
 * Email recipient information
 */
export interface EmailRecipient {
  id: string;
  email: string;
  name?: string;
} 