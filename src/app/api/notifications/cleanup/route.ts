export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldNotifications } from '@/lib/notificationTracking';

/**
 * API route to manually clean up old notifications
 * This removes processed notifications older than the specified number of days
 */
export async function GET(req: NextRequest) {
  try {
    // Check for admin permissions (could be enhanced with actual auth check)
    
    // Get days parameter, default to 7 days
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 7;
    
    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 90) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Days parameter must be a number between 1 and 90' 
        },
        { status: 400 }
      );
    }
    
    // Perform the cleanup
    const deletedCount = await cleanupOldNotifications(days);
    
    return NextResponse.json({
      success: true,
      message: `Cleaned up notifications older than ${days} days`,
      deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      },
      { status: 500 }
    );
  }
} 