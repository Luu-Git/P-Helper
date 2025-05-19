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
    console.log('- From:', from || 'Acme <onboarding@resend.dev>');
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

    // Use default Resend email in development mode, otherwise use the specified from address
    const fromEmail = (process.env.NODE_ENV !== 'production') 
      ? DEFAULT_FROM 
      : (from || 'Pronunciationhelper <notifications@pronunciationhelper.com>');
    
    console.log('Using from email:', fromEmail);

    // Send the email using Resend - exact format from docs
    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to], // Resend expects an array of recipients
        subject,
        html: html || undefined,
        text: text || undefined,
      });

      console.log('Email send response:', { data, error });

      // Return appropriate response based on result
      if (error) {
        console.error('Resend API error:', error);
        return NextResponse.json({ error }, { status: 400 });
      }

      // Return success response
      return NextResponse.json({ data });
    } catch (resendError) {
      console.error('Resend API error details:', resendError);
      return NextResponse.json(
        { error: resendError instanceof Error ? resendError.message : 'Failed to send email with Resend' },
        { status: 500 }
      );
    }
  } catch (error) {
    // Handle exceptions
    console.error('Email API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
} 