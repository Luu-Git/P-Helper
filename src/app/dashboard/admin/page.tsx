'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import CreateUserForm from '@/app/components/CreateUserForm';
import { collection, onSnapshot, query, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserRole } from '@/lib/roles';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';

interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
  columnIndex?: number;
  createdAt?: any;
  isActive?: boolean;
}

export default function AdminDashboard() {
  const { userRole, signOut } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const unsubscribeRefs = useRef<{ [key: string]: () => void }>({});
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    userId: string;
    userEmail: string;
  }>({
    isOpen: false,
    userId: '',
    userEmail: ''
  });

  const isAdmin = userRole === 'admin';

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Initial fetch of all users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'users'));
        const snapshot = await getDocs(q);
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as User));
        setUsers(usersData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching users:', error);
        setError('Failed to load users');
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Function to set up temporary listener for specific user document
  const setupTemporaryListener = (userId: string) => {
    // If there's an existing listener for this document, clear it first
    if (unsubscribeRefs.current[userId]) {
      unsubscribeRefs.current[userId]();
    }

    // Set up new listener
    const unsubscribe = onSnapshot(
      doc(db, 'users', userId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setUsers(prev => prev.map(user => 
            user.id === userId 
              ? { id: docSnapshot.id, ...docSnapshot.data() } as User 
              : user
          ));
        } else {
          // Document was deleted
          setUsers(prev => prev.filter(user => user.id !== userId));
        }
      },
      (error) => {
        console.error('Error in real-time update:', error);
        setError('Failed to get real-time updates');
      }
    );

    // Store the unsubscribe function
    unsubscribeRefs.current[userId] = unsubscribe;

    // Set up cleanup after 5 seconds
    setTimeout(() => {
      if (unsubscribeRefs.current[userId]) {
        unsubscribeRefs.current[userId]();
        delete unsubscribeRefs.current[userId];
      }
    }, 5000);
  };

  // Cleanup listeners on unmount
  useEffect(() => {
    // Nothing to do on mount
    
    // Cleanup function for unmount
    return () => {
      // Store ref in a local variable to avoid the exhaustive-deps warning
      const currentUnsubscribers = { ...unsubscribeRefs.current };
      
      // Clean up each listener
      for (const key in currentUnsubscribers) {
        if (Object.prototype.hasOwnProperty.call(currentUnsubscribers, key)) {
          currentUnsubscribers[key]();
        }
      }
    };
  }, []);

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    if (!isAdmin) {
      setError('Only administrators can modify user settings');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), updates);
      setupTemporaryListener(userId);
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      setError('Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isAdmin) {
      setError('Only administrators can delete users');
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', userId));
      setupTemporaryListener(userId);
      setDeleteDialog({ isOpen: false, userId: '', userEmail: '' });
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user');
    }
  };

  const startEditing = (user: User) => {
    if (!isAdmin) return;
    setEditingUser(user.id);
    setEditName(user.displayName || '');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-6 py-12 bg-white shadow-md rounded-lg text-center">
          <svg 
            className="mx-auto h-12 w-12 text-indigo-500 mb-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Action Required</h2>
          <p className="text-gray-600 mb-8">
            You&apos;ve successfully created a new user account. To continue managing users, you need to sign back in with your admin account.
          </p>
          <button
            onClick={handleSignOut}
            className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <svg 
              className="mr-2 h-5 w-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
              />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">User Management</h1>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Create User Form */}
      <div className="bg-white shadow rounded-lg max-w-2xl">
        <CreateUserForm 
          onSuccess={() => setError(null)}
          onError={(error) => setError('Failed to create user: ' + error.message)}
        />
      </div>

      {/* User List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium mb-4">User List</h2>
          <div className="mt-4">
            <div className="flex flex-col">
              <div className="-my-2 overflow-x-auto">
                <div className="py-2 align-middle inline-block min-w-full">
                  <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Display Name
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Column Assignment
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created At
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                          <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {user.email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.role}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingUser === user.id ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm w-40"
                                    placeholder="Display name"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleUpdateUser(user.id, { displayName: editName });
                                      } else if (e.key === 'Escape') {
                                        setEditingUser(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <div className="flex items-center space-x-1 ml-2">
                                    <button
                                      onClick={() => handleUpdateUser(user.id, { displayName: editName })}
                                      className="p-1 text-green-600 hover:text-green-900 rounded-full hover:bg-green-100 transition-colors"
                                      title="Save changes"
                                    >
                                      <CheckIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => setEditingUser(null)}
                                      className="p-1 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                                      title="Cancel"
                                    >
                                      <XMarkIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span 
                                  className={`${isAdmin ? 'cursor-pointer hover:text-indigo-600 inline-block min-w-[10rem]' : ''}`}
                                  onClick={() => isAdmin && startEditing(user)}
                                >
                                  {user.displayName || (isAdmin ? 'Click to set name' : '-')}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.role === 'tutor' && isAdmin ? (
                                <select
                                  value={user.columnIndex ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const updates: Partial<User> = {
                                      columnIndex: value === '' ? undefined : parseInt(value)
                                    };
                                    // If we're currently editing the display name, include it in the update
                                    if (editingUser === user.id) {
                                      updates.displayName = editName;
                                      setEditingUser(null);
                                    }
                                    handleUpdateUser(user.id, updates);
                                  }}
                                  className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                  <option value="">None</option>
                                  <option value="0">Column 1</option>
                                  <option value="1">Column 2</option>
                                  <option value="2">Column 3</option>
                                  <option value="3">Column 4</option>
                                </select>
                              ) : (
                                <span>{user.columnIndex !== undefined ? `Column ${user.columnIndex + 1}` : 'None'}</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {user.createdAt?.toDate().toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => setDeleteDialog({ isOpen: true, userId: user.id, userEmail: user.email })}
                                className="text-red-600 hover:text-red-900"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, userId: '', userEmail: '' })}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Delete User
            </Dialog.Title>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete the user &quot;{deleteDialog.userEmail}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteDialog({ isOpen: false, userId: '', userEmail: '' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteDialog.userId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
} 