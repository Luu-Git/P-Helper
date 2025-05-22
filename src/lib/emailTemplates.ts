import { 
  GroupedNotifications, 
  NotificationScenario, 
  PendingNotification,
  RecipientNotifications
} from '@/types/notifications';

// Base URL of the application - should be set in environment variables
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pronounciationhelper.com';

// Format a date nicely for email display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format a date and time for email display
function formatDateTime(dateStr: string, timeStr: string): string {
  try {
    const date = new Date(dateStr);
    return `${date.toLocaleDateString('en-GB')} at ${timeStr}`;
  } catch (e) {
    return `${dateStr} at ${timeStr}`;
  }
}

/**
 * Generate email section for Scenario 1: Professor creates time slots
 */
export function generateTimeSlotNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  // Get the professor name from the first notification
  const professorName = notifications[0].professorName || 'A professor';
  
  // Get all time slots
  const timeSlots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (timeSlots.length === 0) return '';
  
  return `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #4f46e5; background-color: #f5f5f5;">
      <h2 style="margin-top: 0; font-size: 18px; color: #333;">🆕 NEW TIME SLOTS AVAILABLE</h2>
      <p>Professor ${professorName} has created new time slots:</p>
      <ul style="margin-top: 5px; padding-left: 20px;">
        ${timeSlots.map(slot => `
          <li>${formatDateTime(slot.date, `${slot.startTime} - ${slot.endTime}`)}</li>
        `).join('')}
      </ul>
      <div style="margin-top: 15px;">
        <a href="${APP_URL}/dashboard/calendar" 
           style="display: inline-block; padding: 8px 16px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">
          View Time Slots
        </a>
      </div>
    </div>
  `;
}

/**
 * Generate email section for Scenario 2: Professor selects a tutor
 */
export function generateTutorSelectionNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  // Get the professor name from the first notification
  const professorName = notifications[0].professorName || 'A professor';
  
  // Get all time slots
  const timeSlots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (timeSlots.length === 0) return '';
  
  return `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #0070dd; background-color: #f5f5f5;">
      <h2 style="margin-top: 0; font-size: 18px; color: #333;">👤 YOU'VE BEEN SELECTED</h2>
      <p>You have been selected by ${professorName} to assist in the following time slot(s):</p>
      <ul style="margin-top: 5px; padding-left: 20px;">
        ${timeSlots.map(slot => `
          <li>${formatDateTime(slot.date, `${slot.startTime} - ${slot.endTime}`)}</li>
        `).join('')}
      </ul>
      <div style="margin-top: 15px;">
        <a href="${APP_URL}/dashboard/calendar" 
           style="display: inline-block; padding: 8px 16px; background-color: #0070dd; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">
          Review and Acknowledge
        </a>
      </div>
    </div>
  `;
}

/**
 * Generate email section for Scenario 3: All tutors provide availability
 */
export function generateAllTutorsRespondedNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  // Get all time slots
  const timeSlots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (timeSlots.length === 0) return '';
  
  return `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #1eff00; background-color: #f5f5f5;">
      <h2 style="margin-top: 0; font-size: 18px; color: #333;">✅ TUTOR SELECTIONS READY</h2>
      <p>All tutors have provided their availability for these time slots:</p>
      <ul style="margin-top: 5px; padding-left: 20px;">
        ${timeSlots.map(slot => `
          <li>${formatDateTime(slot.date, `${slot.startTime} - ${slot.endTime}`)}</li>
        `).join('')}
      </ul>
      <div style="margin-top: 15px;">
        <a href="${APP_URL}/dashboard/calendar" 
           style="display: inline-block; padding: 8px 16px; background-color: #1eff00; color: #333; text-decoration: none; border-radius: 4px; font-weight: 500;">
          Select Tutors
        </a>
      </div>
    </div>
  `;
}

/**
 * Generate email section for Scenario 4: Tutor acknowledges selection
 */
export function generateTutorAcknowledgmentNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  // Get the tutor name from the first notification
  const tutorName = notifications[0].tutorName || 'A tutor';
  
  // Get all time slots
  const timeSlots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (timeSlots.length === 0) return '';
  
  return `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #a335ee; background-color: #f5f5f5;">
      <h2 style="margin-top: 0; font-size: 18px; color: #333;">📋 SELECTION CONFIRMATIONS</h2>
      <p>${tutorName} has confirmed their availability for:</p>
      <ul style="margin-top: 5px; padding-left: 20px;">
        ${timeSlots.map(slot => `
          <li>${formatDateTime(slot.date, `${slot.startTime} - ${slot.endTime}`)}</li>
        `).join('')}
      </ul>
      <div style="margin-top: 15px;">
        <a href="${APP_URL}/dashboard/calendar" 
           style="display: inline-block; padding: 8px 16px; background-color: #a335ee; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">
          View Confirmations
        </a>
      </div>
    </div>
  `;
}

/**
 * Generate email section for Scenario 5: Tutor acknowledges assignment
 */
export function generateProfessorNotificationTemplate(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  // Get the tutor name from the first notification
  const tutorName = notifications[0].tutorName || 'A tutor';
  
  // Get all time slots
  const timeSlots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (timeSlots.length === 0) return '';
  
  return `
    <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid #00ccff; background-color: #f5f5f5;">
      <h2 style="margin-top: 0; font-size: 18px; color: #333;">✅ TUTOR ASSIGNMENT ACKNOWLEDGED</h2>
      <p>${tutorName} has acknowledged their assignment for:</p>
      <ul style="margin-top: 5px; padding-left: 20px;">
        ${timeSlots.map(slot => `
          <li>${formatDateTime(slot.date, `${slot.startTime} - ${slot.endTime}`)}</li>
        `).join('')}
      </ul>
      <div style="margin-top: 15px;">
        <a href="${APP_URL}/dashboard/calendar" 
           style="display: inline-block; padding: 8px 16px; background-color: #00ccff; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">
          View Calendar
        </a>
      </div>
    </div>
  `;
}

/**
 * Compile the complete email template with all relevant sections
 */
export function compileEmailTemplate(
  greeting: string,
  sections: string[],
  footer: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
        }
        .email-container {
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 20px;
          margin: 20px 0;
        }
        .notification-section {
          margin-bottom: 25px;
          padding-bottom: 15px;
          border-bottom: 1px solid #eee;
        }
        h1 {
          color: #2c3e50;
        }
        h2 {
          color: #3498db;
          font-size: 18px;
          margin-top: 15px;
          margin-bottom: 10px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #eee;
          font-size: 14px;
          color: #777;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <h1>Pronunciation Assistant</h1>
        <p>${greeting},</p>
        
        ${sections.join('\n')}
        
        <div class="footer">
          <p>${footer}</p>
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Check if there are any actual notifications to send
 */
export function hasNotificationContent(notifications: RecipientNotifications[]): boolean {
  return notifications.some(group => group.notifications.length > 0);
} 