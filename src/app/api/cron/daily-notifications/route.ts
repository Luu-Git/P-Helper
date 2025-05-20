export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { processNotifications } from '@/lib/emailProcessor';
import { cleanupOldNotifications } from '@/lib/notificationTracking';

// This route is triggered by Vercel Cron Jobs
export async function GET(request: Request) {
  try {
    // Process all pending notifications
    const result = await processNotifications();
    
    // Clean up old notifications (keep for 14 days)
    let cleanupResult = { deletedCount: 0 };
    try {
      cleanupResult = { 
        deletedCount: await cleanupOldNotifications(14)
      };
    } catch (cleanupError) {
      console.error('Error cleaning up old notifications:', cleanupError);
      // Continue with the response even if cleanup fails
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Daily notifications processed',
      emailsSent: result.emailsSent,
      notificationsProcessed: result.notificationsProcessed,
      cleanupResult
    });
  } catch (error) {
    console.error('Error processing daily notifications:', error);
    return NextResponse.json(
      { error: 'Failed to process daily notifications', details: (error as Error).message },
      { status: 500 }
    );
  }
} 