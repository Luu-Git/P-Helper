export const dynamic = 'force-dynamic';

import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// The default sender should be a verified domain or use Resend's default
const DEFAULT_FROM = 'onboarding@resend.dev'; // Can be changed to your verified domain

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const { to, subject, text, html, from } = await req.json();

    console.log('Email send attempt:');
    console.log('- To:', to);
    console.log('- Subject:', subject);
    console.log('- Environment:', process.env.NODE_ENV);
    console.log('- Resend API Key exists:', !!process.env.RESEND_API_KEY);
    
    // Validate required fields
    if (!to || !subject || (!text && !html)) {
      console.error('Missing required fields in email request');
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and either text or html' },
        { status: 400 }
      );
    }

    // Handle test email redirection if needed
    const testEmail = process.env.TEST_EMAIL;
    const forceTestEmail = process.env.FORCE_TEST_EMAIL === 'true';
    
    // Determine recipients - if in test mode or force test email is enabled, use test email
    let recipients = Array.isArray(to) ? to : [to];
    if (testEmail && (process.env.NODE_ENV !== 'production' || process.env.EMAIL_TEST_MODE === 'true' || forceTestEmail)) {
      console.log(`Redirecting all emails to test address: ${testEmail}`);
      recipients = [testEmail];
    }
    
    // Use default Resend email in development mode, otherwise use the specified from address
    const fromEmail = (process.env.NODE_ENV !== 'production') 
      ? DEFAULT_FROM 
      : (from || 'Pronunciationhelper <notifications@pronunciationhelper.com>');
    
    console.log('Using from email:', fromEmail);

    // Send the email using Resend SDK directly
    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: recipients,
        subject,
        html: html || undefined,
        text: text || undefined,
      });

      console.log('Email send response:', { data, error });

      // Return appropriate response based on result
      if (error) {
        console.error('Resend API error:', error);
        return NextResponse.json({ 
          success: false, 
          error: error.message || 'Failed to send email',
          details: error
        }, { status: 400 });
      }

      // Return success response
      return NextResponse.json({ success: true, data });
    } catch (resendError) {
      console.error('Resend API error details:', resendError);
      return NextResponse.json(
        { 
          success: false, 
          error: resendError instanceof Error ? resendError.message : 'Failed to send email with Resend',
          details: resendError 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // Handle exceptions
    console.error('Email API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send email',
        details: error
      },
      { status: 500 }
    );
  }
} 