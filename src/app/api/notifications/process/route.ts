export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { processDailyEmails } from '@/lib/emailProcessor';
import { createNotification } from '@/lib/notificationTracking';
import { Timestamp } from 'firebase/firestore';

/**
 * API route to process email notifications manually
 * This is for testing purposes and will eventually be replaced by a scheduled Cloud Function
 */
export async function POST(req: NextRequest) {
  try {
    // Check for API key or other authentication if needed
    // For now, this is just for testing so we'll leave it open
    
    const result = await processDailyEmails();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing notifications:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      },
      { status: 500 }
    );
  }
}

/**
 * API route to create test notifications for testing
 */
export async function GET(req: NextRequest) {
  try {
    // Parse URL parameters
    const { searchParams } = new URL(req.url);
    const scenario = parseInt(searchParams.get('scenario') || '1') as 1 | 2 | 3 | 4;
    const professorId = searchParams.get('professorId') || 'test-professor';
    const tutorId = searchParams.get('tutorId') || 'test-tutor';
    const recipientIds = searchParams.get('recipients')?.split(',') || [tutorId];
    
    // Create a test notification
    const notificationData = {
      scenario,
      recipientIds,
      professorId,
      professorName: 'Test Professor',
      tutorId,
      tutorName: 'Test Tutor',
      timeSlotIds: ['test-timeslot-1'],
      timeSlotDetails: [{
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '11:00'
      }]
    };
    
    const notificationId = await createNotification(notificationData);
    
    return NextResponse.json({
      success: true,
      message: 'Test notification created',
      notificationId,
      notificationData
    });
  } catch (error) {
    console.error('Error creating test notification:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      },
      { status: 500 }
    );
  }
} 