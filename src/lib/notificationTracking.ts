import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  Timestamp, 
  updateDoc, 
  doc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  PendingNotification, 
  GroupedNotifications, 
  NotificationTimeSlot,
  RecipientNotifications,
  NotificationScenario,
  EmailRecipient
} from '@/types/notifications';
import { User } from '@/types/user';

const NOTIFICATIONS_COLLECTION = 'notifications';
const USERS_COLLECTION = 'users';

/**
 * Create a new notification in the database
 */
export async function createNotification({
  scenario,
  recipientIds,
  timeSlotIds,
  timeSlotDetails,
  professorId,
  professorName,
  tutorId,
  tutorName
}: {
  scenario: NotificationScenario;
  recipientIds: string[];
  timeSlotIds: string[];
  timeSlotDetails?: NotificationTimeSlot[];
  professorId?: string;
  professorName?: string;
  tutorId?: string;
  tutorName?: string;
}): Promise<string> {
  try {
    // Create the notification document
    const notification: Omit<PendingNotification, 'id'> = {
      scenario,
      recipientIds,
      timeSlotIds,
      created: new Date(),
      processed: false
    };

    // Add optional fields if provided
    if (timeSlotDetails) notification.timeSlotDetails = timeSlotDetails;
    if (professorId) notification.professorId = professorId;
    if (professorName) notification.professorName = professorName;
    if (tutorId) notification.tutorId = tutorId;
    if (tutorName) notification.tutorName = tutorName;

    // Add to Firestore
    const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), notification);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Check if a notification with the same scenario and recipients already exists for today
 */
export async function notificationExists({
  scenario,
  recipientIds
}: {
  scenario: NotificationScenario;
  recipientIds: string[];
}): Promise<boolean> {
  try {
    // Get the start of the current day in UTC
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); 
    
    // Query for unprocessed notifications with matching scenario and at least one matching recipient
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('scenario', '==', scenario),
      where('created', '>=', startOfDay),
      where('processed', '==', false)
    );

    const querySnapshot = await getDocs(q);
    
    // Check if any notification has at least one matching recipient
    return querySnapshot.docs.some(doc => {
      const data = doc.data() as PendingNotification;
      return recipientIds.some(id => data.recipientIds.includes(id));
    });
  } catch (error) {
    console.error('Error checking notification existence:', error);
    // In case of error, return false to allow creating a new notification
    return false;
  }
}

/**
 * Get all pending (unprocessed) notifications from the database
 */
export async function getPendingNotifications(): Promise<PendingNotification[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('processed', '==', false)
    );

    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data() as Omit<PendingNotification, 'id'>;
      return {
        id: doc.id,
        ...data
      };
    });
  } catch (error) {
    console.error('Error getting pending notifications:', error);
    return [];
  }
}

/**
 * Mark multiple notifications as processed
 */
export async function markNotificationsProcessed(notificationIds: string[]): Promise<void> {
  try {
    const now = new Date();
    
    // Update each notification's processed status
    const updatePromises = notificationIds.map(id => 
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, id), {
        processed: true,
        processedAt: now
      })
    );
    
    await Promise.all(updatePromises);
    console.log(`Marked ${notificationIds.length} notifications as processed`);
  } catch (error) {
    console.error('Error marking notifications as processed:', error);
    throw error;
  }
}

/**
 * Group notifications by recipient and scenario
 */
export function groupNotifications(notifications: PendingNotification[]): GroupedNotifications {
  const grouped: GroupedNotifications = {};
  
  for (const notification of notifications) {
    // Skip if no recipients
    if (!notification.recipientIds || notification.recipientIds.length === 0) {
      continue;
    }
    
    // Add to each recipient's group
    for (const recipientId of notification.recipientIds) {
      // Initialize recipient entry if needed
      if (!grouped[recipientId]) {
        grouped[recipientId] = {};
      }
      
      // Initialize scenario group if needed
      if (!grouped[recipientId][notification.scenario]) {
        grouped[recipientId][notification.scenario] = {
          scenario: notification.scenario,
          notifications: []
        };
      }
      
      // Add notification to the appropriate scenario group
      grouped[recipientId][notification.scenario].notifications.push(notification);
    }
  }
  
  return grouped;
}

/**
 * Get multiple users' information by their IDs
 */
export async function getUsersInfo(userIds: string[]): Promise<Map<string, EmailRecipient>> {
  try {
    // Create an array from the Set to avoid iteration issues
    const uniqueIds = Array.from(new Set(userIds));
    const usersMap = new Map<string, EmailRecipient>();
    
    const getUserPromises = uniqueIds.map(async (id) => {
      const user = await getUserInfo(id);
      if (user) {
        usersMap.set(id, user);
      }
    });
    
    await Promise.all(getUserPromises);
    return usersMap;
  } catch (error) {
    console.error('Error fetching multiple users:', error);
    return new Map();
  }
}

/**
 * Get a single user's information by ID
 */
export async function getUserInfo(userId: string): Promise<EmailRecipient | null> {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.warn(`User ${userId} not found`);
      return null;
    }
    
    const userData = userDoc.data() as User;
    
    return {
      id: userId,
      email: userData.email,
      name: userData.displayName
    };
  } catch (error) {
    console.error(`Error fetching user ${userId}:`, error);
    return null;
  }
}

/**
 * Clean up old processed notifications older than the specified days
 * @param daysOld Number of days to keep processed notifications (default: 7)
 * @returns Number of deleted notifications
 */
export async function cleanupOldNotifications(daysOld: number = 7): Promise<number> {
  try {
    // Calculate the cutoff date
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (daysOld * 24 * 60 * 60 * 1000));
    
    console.log(`Cleaning up notifications processed before ${cutoffDate.toISOString()}`);
    
    // Query for processed notifications older than the cutoff date
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('processed', '==', true),
      where('processedAt', '<=', cutoffDate)
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No old notifications to clean up');
      return 0;
    }
    
    // Delete each old notification
    const deletePromises = querySnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    
    await Promise.all(deletePromises);
    console.log(`Deleted ${querySnapshot.size} old notifications`);
    
    return querySnapshot.size;
  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
    throw error;
  }
} 