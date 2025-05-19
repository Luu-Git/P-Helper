'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface TestResult {
  success: boolean;
  error?: string;
  message?: string;
  emailsSent?: number;
  processedNotifications?: number;
  notificationId?: string;
  deletedCount?: number;
}

export default function EmailAdminPage() {
  const { user, userRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [scenario, setScenario] = useState<'1' | '2' | '3' | '4'>('1');
  const [action, setAction] = useState<'create' | 'process' | 'cleanup'>('create');
  const [recipients, setRecipients] = useState('');
  const [cleanupDays, setCleanupDays] = useState('7');

  if (!user || userRole !== 'admin') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <p className="text-red-700">
            You need admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  const handleCreateTest = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      let url = new URL('/api/notifications/process', window.location.origin);
      url.searchParams.append('scenario', scenario);
      
      if (recipients) {
        url.searchParams.append('recipients', recipients);
      }
      
      console.log('Creating test notification with URL:', url.toString());
      const response = await fetch(url.toString());
      const data = await response.json();
      
      console.log('Test notification result:', data);
      setResult(data);
    } catch (error) {
      console.error('Error creating test notification:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProcessEmails = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const url = new URL('/api/notifications/process', window.location.origin);
      console.log('Processing notifications with URL:', url.toString());
      
      const response = await fetch(url.toString(), {
        method: 'POST'
      });
      const data = await response.json();
      
      console.log('Process emails result:', data);
      setResult(data);
    } catch (error) {
      console.error('Error processing emails:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupNotifications = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const url = new URL('/api/notifications/cleanup', window.location.origin);
      url.searchParams.append('days', cleanupDays);
      console.log('Cleaning up notifications with URL:', url.toString());
      
      const response = await fetch(url.toString());
      const data = await response.json();
      
      console.log('Cleanup result:', data);
      setResult(data);
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Email Notification Testing</h1>
      
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-yellow-700">
          This page allows you to test the email notification system. You can create test notifications
          and process them to send emails.
        </p>
      </div>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Action
          </label>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-indigo-600"
                checked={action === 'create'}
                onChange={() => setAction('create')}
              />
              <span className="ml-2">Create Test Notification</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-indigo-600"
                checked={action === 'process'}
                onChange={() => setAction('process')}
              />
              <span className="ml-2">Process & Send Emails</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4 text-indigo-600"
                checked={action === 'cleanup'}
                onChange={() => setAction('cleanup')}
              />
              <span className="ml-2">Cleanup Old Notifications</span>
            </label>
          </div>
        </div>
        
        {action === 'create' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Type
              </label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as '1' | '2' | '3' | '4')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="1">1: Professor creates time slots</option>
                <option value="2">2: Professor selects a tutor</option>
                <option value="3">3: All tutors provide availability</option>
                <option value="4">4: Tutor acknowledges selection</option>
              </select>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient IDs (comma-separated, leave empty for defaults)
              </label>
              <input
                type="text"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="user1,user2,etc"
              />
              <p className="mt-1 text-xs text-gray-500">
                The test system will use the test email for all recipients in test mode.
              </p>
            </div>
          </>
        )}

        {action === 'cleanup' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Days to Keep Processed Notifications
            </label>
            <input
              type="number"
              value={cleanupDays}
              onChange={(e) => setCleanupDays(e.target.value)}
              min="1"
              max="30"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="7"
            />
            <p className="mt-1 text-xs text-gray-500">
              Notifications processed more than this many days ago will be deleted.
            </p>
          </div>
        )}
        
        <div className="flex justify-end">
          <button
            onClick={
              action === 'create' ? handleCreateTest : 
              action === 'process' ? handleProcessEmails : 
              handleCleanupNotifications
            }
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 
              action === 'create' ? 'Create Test Notification' : 
              action === 'process' ? 'Process & Send Emails' : 
              'Cleanup Old Notifications'
            }
          </button>
        </div>
      </div>
      
      {result && (
        <div className={`mt-4 p-4 border-l-4 rounded-md ${result.success ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
          <h3 className={`text-lg font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? 'Success' : 'Error'}
          </h3>
          
          {result.message && (
            <p className="mt-2 text-sm">{result.message}</p>
          )}
          
          {result.error && (
            <p className="mt-2 text-sm text-red-700">{result.error}</p>
          )}
          
          {result.notificationId && (
            <p className="mt-2 text-sm">Notification ID: {result.notificationId}</p>
          )}
          
          {result.emailsSent !== undefined && (
            <p className="mt-2 text-sm">Emails sent: {result.emailsSent}</p>
          )}
          
          {result.processedNotifications !== undefined && (
            <p className="mt-2 text-sm">Notifications processed: {result.processedNotifications}</p>
          )}

          {result.deletedCount !== undefined && (
            <p className="mt-2 text-sm">Notifications deleted: {result.deletedCount}</p>
          )}
          
          <div className="mt-4 p-4 bg-gray-100 rounded overflow-x-auto">
            <pre className="text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 