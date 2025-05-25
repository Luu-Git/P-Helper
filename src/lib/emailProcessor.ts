import { 
  PendingNotification,
  GroupedNotifications,
  RecipientNotifications,
  EmailRecipient, 
  NotificationScenario
} from '@/types/notifications';
import { 
  getPendingNotifications, 
  groupNotifications, 
  getUserInfo,
  markNotificationsProcessed
} from './notificationTracking';
import { sendEmail } from './email';

// Test email for development - will be used instead of actual recipients in test mode
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const FORCE_TEST_EMAIL = process.env.FORCE_TEST_EMAIL === 'true';

/**
 * Process test emails for development purposes
 */
export async function processDailyEmails() {
  try {
    const pendingNotifications = await getPendingNotifications();
    console.log(`Found ${pendingNotifications.length} pending notifications`);
    
    if (pendingNotifications.length === 0) {
      return { 
        success: true, 
        message: 'No pending notifications found' 
      };
    }
    
    // Group notifications by recipient
    const groupedByRecipient = groupNotifications(pendingNotifications);
    console.log('Grouped notifications by recipient', Object.keys(groupedByRecipient));
    
    // In test mode, replace all recipient emails with the test email
    if (TEST_EMAIL && (process.env.NODE_ENV !== 'production' || process.env.EMAIL_TEST_MODE === 'true' || FORCE_TEST_EMAIL)) {
      console.log(`Test mode${FORCE_TEST_EMAIL ? ' (FORCED)' : ''}: Sending all emails to ${TEST_EMAIL}`);
      
      // Send a test email with all notifications
      const htmlContent = `
        <h1>Test Email - All Pending Notifications</h1>
        <p>This is a test email containing all pending notifications.</p>
        <pre>${JSON.stringify(groupedByRecipient, null, 2)}</pre>
      `;
      
      console.log('Sending test email to', TEST_EMAIL);
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: 'Test - Pronunciation Assistant Notifications',
        html: htmlContent
      });
      
      console.log('Test email send result:', result);
      
      if (!result.success) {
        return { 
          success: false, 
          message: `Failed to send test email: ${result.error}` 
        };
      }
      
      // If we have notification IDs, mark them as processed
      const notificationIds = pendingNotifications
        .filter(n => n.id)
        .map(n => n.id as string);
        
      if (notificationIds.length > 0) {
        try {
          await markNotificationsProcessed(notificationIds);
          console.log(`Marked ${notificationIds.length} notifications as processed`);
        } catch (error) {
          console.error('Error marking notifications as processed:', error);
        }
      }
      
      return { 
        success: true, 
        message: `Test email sent to ${TEST_EMAIL}` 
      };
    }
    
    // If not in test mode, process notifications normally
    const result = await processNotifications();
    return {
      success: result.success,
      message: `Processed ${result.notificationsProcessed} notifications, sent ${result.emailsSent} emails`
    };
  } catch (error) {
    console.error('Error processing daily emails:', error);
    return { 
      success: false, 
      message: (error as Error).message 
    };
  }
}

export async function forceProcessEmails() {
  return processDailyEmails();
}

/**
 * Generate a notification section for time slots
 */
function generateTimeSlotNotification(notifications: PendingNotification[]): string {
  const slots = notifications.flatMap(n => n.timeSlotDetails || []);
  
  if (slots.length === 0) return '';
  
  return `
    <div class="notification-section">
      <h2>New Time Slots Available</h2>
      <p>The following time slots have been added:</p>
      <ul>
        ${slots.map(slot => `
          <li>
            <strong>${slot.date}</strong> from ${slot.startTime} to ${slot.endTime}
          </li>
        `).join('')}
      </ul>
      <p>Please check your calendar to respond with your availability.</p>
    </div>
  `;
}

/**
 * Generate a notification section for tutor selection
 */
function generateTutorSelectionNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  return `
    <div class="notification-section">
      <h2>You've Been Selected as a Tutor</h2>
      <p>You've been selected to tutor the following time slot(s):</p>
      <ul>
        ${notifications.flatMap(n => (n.timeSlotDetails || []).map(slot => `
          <li>
            <strong>${slot.date}</strong> from ${slot.startTime} to ${slot.endTime}
            ${n.professorName ? `by Professor ${n.professorName}` : ''}
          </li>
        `)).join('')}
      </ul>
      <p>Please acknowledge these selections in your calendar.</p>
    </div>
  `;
}

/**
 * Generate a notification section for all tutors responded
 */
function generateAllTutorsRespondedNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  return `
    <div class="notification-section">
      <h2>All Tutors Have Responded</h2>
      <p>All tutors have provided their availability for the following time slot(s):</p>
      <ul>
        ${notifications.flatMap(n => (n.timeSlotDetails || []).map(slot => `
          <li>
            <strong>${slot.date}</strong> from ${slot.startTime} to ${slot.endTime}
          </li>
        `)).join('')}
      </ul>
      <p>Please select a tutor for these time slots.</p>
    </div>
  `;
}

/**
 * Generate a notification section for tutor acknowledgment
 */
function generateTutorAcknowledgmentNotification(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  return `
    <div class="notification-section">
      <h2>Tutor Confirmation</h2>
      <p>The following exam sessions have been confirmed:</p>
      <ul>
        ${notifications.flatMap(n => (n.timeSlotDetails || []).map(slot => `
          <li>
            <strong>${slot.date}</strong> from ${slot.startTime} to ${slot.endTime}
            ${n.tutorName ? `with ${n.tutorName}` : ''}
          </li>
        `)).join('')}
      </ul>
    </div>
  `;
}

/**
 * Generate a notification section for tutor assignment acknowledgment (professor notification)
 */
function generateProfessorNotificationSection(notifications: PendingNotification[]): string {
  if (notifications.length === 0) return '';
  
  return `
    <div class="notification-section">
      <h2>Tutor Assignment Acknowledged</h2>
      <p>The following tutors have acknowledged their assignments:</p>
      <ul>
        ${notifications.flatMap(n => (n.timeSlotDetails || []).map(slot => `
          <li>
            <strong>${slot.date}</strong> from ${slot.startTime} to ${slot.endTime}
            ${n.tutorName ? `by ${n.tutorName}` : ''}
          </li>
        `)).join('')}
      </ul>
    </div>
  `;
}

/**
 * Compile the complete email template
 */
function compileEmailTemplate(greeting: string, sections: string[], footer: string): string {
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
 * Send a digest email to a recipient with all their notifications
 */
async function sendDigestEmail(recipient: EmailRecipient, notifications: RecipientNotifications[]): Promise<void> {
  try {
    // Generate the appropriate content for each scenario
    const emailSections: string[] = [];
    
    for (const notificationGroup of notifications) {
      const { scenario, notifications: notifs } = notificationGroup;
      
      if (!notifs || notifs.length === 0) continue;
      
      // Generate the appropriate section for this scenario
      let sectionContent = '';
      
      switch (scenario) {
        case NotificationScenario.NEW_TIME_SLOTS:
          sectionContent = generateTimeSlotNotification(notifs);
          break;
          
        case NotificationScenario.TUTOR_SELECTED:
          sectionContent = generateTutorSelectionNotification(notifs);
          break;
          
        case NotificationScenario.ALL_TUTORS_RESPONDED:
          sectionContent = generateAllTutorsRespondedNotification(notifs);
          break;
          
        case NotificationScenario.TUTOR_ACKNOWLEDGED:
          sectionContent = generateTutorAcknowledgmentNotification(notifs);
          break;
          
        case NotificationScenario.PROFESSOR_NOTIFIED:
          sectionContent = generateProfessorNotificationSection(notifs);
          break;
          
        default:
          console.warn(`Unknown scenario: ${scenario}`);
          continue;
      }
      
      if (sectionContent) {
        emailSections.push(sectionContent);
      }
    }
    
    if (emailSections.length === 0) {
      console.log(`No email content generated for ${recipient.email}`);
      return;
    }
    
    // Compile the complete email template
    const htmlContent = compileEmailTemplate(
      `Hello ${recipient.name || recipient.email.split('@')[0]}`,
      emailSections,
      `You can view and manage these items in your <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color: #0066cc; text-decoration: underline;">dashboard</a>.`
    );
    
    // Send the email
    const result = await sendEmail({
      to: recipient.email,
      subject: 'Pronunciation Assistant - Daily Digest',
      html: htmlContent,
    });
    
    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
    }
    
    console.log(`Digest email sent to ${recipient.email}`);
  } catch (error) {
    console.error('Error sending digest email:', error);
    throw error;
  }
}

/**
 * Process all pending notifications and send digested emails to users
 * @returns Result of the processing operation
 */
export async function processNotifications() {
  try {
    // 1. Get all pending notifications
    const pendingNotifications = await getPendingNotifications();
    
    if (pendingNotifications.length === 0) {
      console.log('No pending notifications to process');
      return {
        success: true,
        emailsSent: 0,
        notificationsProcessed: 0
      };
    }
    
    // 2. Group notifications by recipient and scenario
    const groupedNotifications = groupNotifications(pendingNotifications);
    
    // 3. Process each recipient's notifications
    let emailsSent = 0;
    let notificationIds: string[] = [];
    
    // Check if we should force redirect to test email
    const forceTestEmail = TEST_EMAIL && FORCE_TEST_EMAIL;
    if (forceTestEmail) {
      console.log(`PRODUCTION ALERT: Forcing all emails to test address ${TEST_EMAIL}`);
    }
    
    for (const recipientId in groupedNotifications) {
      try {
        // Get user info for email recipient
        const recipient = await getUserInfo(recipientId);
        
        if (!recipient || !recipient.email) {
          console.error(`Missing email for recipient ${recipientId}`);
          continue;
        }
        
        // Convert the recipient's grouped notifications to array format for sendDigestEmail
        const recipientGroups: RecipientNotifications[] = [];
        const scenarioGroups = groupedNotifications[recipientId];
        
        for (const scenarioKey in scenarioGroups) {
          const scenarioNum = parseInt(scenarioKey, 10);
          recipientGroups.push(scenarioGroups[scenarioNum]);
        }
        
        // If forcing test email in production, override recipient email
        const targetEmail = forceTestEmail ? TEST_EMAIL : recipient.email;
        
        // Send digest email to this recipient (or test email)
        if (forceTestEmail) {
          console.log(`Redirecting email for ${recipient.email} to ${targetEmail}`);
        }
        
        // Modify recipient for test email mode
        const emailRecipient = forceTestEmail ? 
          { ...recipient, email: targetEmail as string, name: `${recipient.name || recipient.email} (TEST MODE)` } : 
          recipient;
        
        await sendDigestEmail(emailRecipient, recipientGroups);
        emailsSent++;
        
        // Collect notification IDs that were processed
        for (const scenarioKey in scenarioGroups) {
          const group = scenarioGroups[scenarioKey];
          if (group.notifications) {
            group.notifications.forEach(n => {
              if (n.id) notificationIds.push(n.id);
            });
          }
        }
      } catch (error) {
        console.error(`Error processing notifications for ${recipientId}:`, error);
      }
    }
    
    // 4. Mark notifications as processed
    if (notificationIds.length > 0) {
      await markNotificationsProcessed(notificationIds);
    }
    
    return {
      success: true,
      emailsSent,
      notificationsProcessed: notificationIds.length
    };
  } catch (error) {
    console.error('Error processing notifications:', error);
    throw error;
  }
} 