export type UserRole = 'admin' | 'professor' | 'tutor';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 3,
  professor: 2,
  tutor: 1,
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'manage_users',      // Can create, edit, delete users
    'manage_roles',      // Can change user roles
    'view_all_notes',    // Can view all student notes
    'manage_all_notes',  // Can edit/delete any note
    'view_calendar',     // Can view availability calendar
    'manage_calendar',   // Can manage calendar events
  ],
  professor: [
    'view_all_notes',    // Can view all student notes
    'manage_own_notes',  // Can manage their own notes
    'view_calendar',     // Can view availability calendar
    'manage_calendar',   // Can manage calendar events
  ],
  tutor: [
    'view_assigned_notes',  // Can only view notes for assigned students
    'manage_own_notes',     // Can manage their own notes
    'view_calendar',        // Can view availability calendar
    'manage_own_calendar',  // Can manage their own calendar events
  ],
};

export function hasPermission(userRole: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[userRole]?.includes(permission) ?? false;
}

export function canManageRole(userRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] > ROLE_HIERARCHY[targetRole];
}

// Hook to protect components based on permissions
export function checkPermission(userRole: UserRole | undefined, requiredPermission: string): boolean {
  if (!userRole) return false;
  return hasPermission(userRole, requiredPermission);
} 