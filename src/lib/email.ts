/**
 * Email utility functions for the application
 */
import { Resend } from 'resend';

/**
 * Sends an email using the email API
 * @param to Recipient email address or array of addresses
 * @param subject Email subject
 * @param html HTML email content
 * @param text Optional plain text email content
 * @param from Sender email address with name (optional, defaults to appropriate sender based on environment)
 * @returns Promise with the API response
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}) {
  try {
    // Convert single recipient to array if needed
    const toArray = Array.isArray(to) ? to : [to];
    
    // Check if we're in the browser
    const isBrowser = typeof window !== 'undefined';
    
    if (isBrowser) {
      // Browser environment - use fetch API
      const baseUrl = window.location.origin;
      console.log('Using browser fetch with base URL:', baseUrl);
      
      const response = await fetch(`${baseUrl}/api/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: toArray,
          subject,
          html,
          text,
          from,
        }),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to send email');
      }
  
      return { success: true, data };
    } else {
      // Server environment - use Resend SDK directly
      console.log('Using Resend SDK directly in server environment');
      
      // Initialize Resend with API key
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        console.error('RESEND_API_KEY is not set');
        return { 
          success: false, 
          error: 'RESEND_API_KEY is not set' 
        };
      }
      
      const resend = new Resend(resendApiKey);
      
      // Handle test email redirection if needed
      const testEmail = process.env.TEST_EMAIL;
      const forceTestEmail = process.env.FORCE_TEST_EMAIL === 'true';
      
      // Determine recipients
      let recipients = toArray;
      if (testEmail && (process.env.NODE_ENV !== 'production' || process.env.EMAIL_TEST_MODE === 'true' || forceTestEmail)) {
        console.log(`Redirecting email to test address: ${testEmail}`);
        recipients = [testEmail];
      }
      
      // Set "from" email based on environment
      const defaultFrom = 'onboarding@resend.dev';
      const fromEmail = (process.env.NODE_ENV !== 'production')
        ? defaultFrom
        : (from || 'Pronunciationhelper <notifications@pronunciationhelper.com>');
      
      console.log('Sending email to:', recipients);
      console.log('From:', fromEmail);
      
      // Build email options based on what we have
      const emailOptions = {
        from: fromEmail,
        to: recipients,
        subject,
      };
      
      // Add html or text conditionally
      if (html) {
        // Send with HTML content
        const { data, error } = await resend.emails.send({
          ...emailOptions,
          html
        });
      
        if (error) {
          console.error('Error sending email:', error);
          return { 
            success: false, 
            error: error.message || 'Failed to send email'
          };
        }
        
        return { success: true, data };
      } else if (text) {
        // Send with text content only
        const { data, error } = await resend.emails.send({
          ...emailOptions,
          text
        });
      
        if (error) {
          console.error('Error sending email:', error);
          return { 
            success: false, 
            error: error.message || 'Failed to send email'
          };
        }
        
        return { success: true, data };
      } else {
        // Neither html nor text was provided
        return {
          success: false,
          error: 'Either html or text must be provided'
        };
      }
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
} 