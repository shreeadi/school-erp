/**
 * Permission catalog: "<module>:<action>".
 *
 * Permissions are checked at two levels:
 *   1. Module level: the route guard requires the permission (any scope).
 *   2. Record level: services narrow queries by the scopes the user holds
 *      (ALL / ASSIGNED / LINKED / OWN), see access-scope.service.ts.
 *
 * Modules marked "later phase" are declared now so that the role matrix is
 * complete and editable; their routes arrive with the module.
 */
export const PERMISSIONS = {
  // School configuration & access control
  'school.settings:read': 'View school profile and settings',
  'school.settings:manage': 'Change school profile and settings',
  'roles:read': 'View roles and their permissions',
  'roles:manage': 'Create roles, change permissions, assign roles to users',
  'audit:read': 'View the audit log',
  'dashboard:read': 'View the management overview',

  // Academic structure
  'academics:read': 'View academic years, classes, sections, subjects, curriculum',
  'academics:manage': 'Configure academic years, classes, sections, subjects, curriculum',
  'grading:read': 'View grading scales and exam categories',
  'grading:manage': 'Configure grading scales and exam categories',
  'assignments:manage': 'Assign class teachers and subject teachers',

  // People
  'staff:read': 'View staff profiles',
  'staff:manage': 'Add and edit staff',
  'students:read': 'View student records',
  'students:manage': 'Admit, edit, transfer and withdraw students',
  'guardians:read': 'View guardian records',
  'guardians:manage': 'Add, edit and link guardians',
  'accounts:manage': 'Create and disable portal login accounts',

  // Later phases
  'attendance:read': 'View attendance',
  'attendance:mark': 'Mark and edit attendance',
  'homework:read': 'View homework',
  'homework:manage': 'Create and evaluate homework',
  'exams:read': 'View examinations and results',
  'exams:manage': 'Create examinations and schedules',
  'exams:enter_marks': 'Enter marks',
  'exams:publish': 'Approve and publish results and report cards',
  'fees:read': 'View fee structures and dues',
  'fees:manage': 'Configure fees, concessions and refunds',
  'fees:collect': 'Record and reconcile payments',
  'hr.leave:read': 'View leave applications',
  'hr.leave:approve': 'Approve or reject leave',
  'library:manage': 'Manage the library',
  'transport:manage': 'Manage transport routes and vehicles',
  'announcements:manage': 'Publish announcements',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
