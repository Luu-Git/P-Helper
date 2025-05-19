/**
 * Email utility functions for the application
 */

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
      // Server environment - use the email API endpoint directly
      // This avoids issues with the Resend library types and fetch in server components
      console.log('Using local API endpoint on server');
      
      // For development, use localhost; for production, use the configured app URL
      const baseUrl = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:3000'  // Always use localhost in development
        : (process.env.NEXT_PUBLIC_APP_URL || 'https://pronunciationhelper.com');
      
      console.log('Using base URL for server API call:', baseUrl);
      
      // Use custom fetch with resolved URL
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
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
} 