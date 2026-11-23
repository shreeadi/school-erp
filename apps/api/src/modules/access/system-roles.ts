import type { PermissionScope } from '../../generated/prisma/enums.js';
import { ALL_PERMISSIONS, type Permission } from './permissions.js';

type Grant = Permission | [Permission, PermissionScope];

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  grants: Grant[];
}

const readAll: Permission[] = [
  'school.settings:read', 'roles:read', 'dashboard:read', 'academics:read', 'grading:read',
  'staff:read', 'students:read', 'guardians:read', 'attendance:read', 'homework:read',
  'exams:read', 'fees:read', 'hr.leave:read',
];

/**
 * Roles every school gets on provisioning. A school can edit their permissions
 * (except SCHOOL_ADMIN) and add custom roles. The platform Super Admin is not a
 * school role: it lives in platform_admins and has no school membership.
 *
 * Teacher sub-roles (Class Teacher, Subject Teacher, Head of Department) are not
 * separate roles: they are derived from actual assignments (sections.class_teacher_id,
 * teaching_assignments, departments.head_id) through the ASSIGNED scope.
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: 'SCHOOL_ADMIN',
    name: 'School Admin',
    description: 'Full administration of this school',
    grants: ALL_PERMISSIONS,
  },
  {
    key: 'PRINCIPAL',
    name: 'Principal',
    description: 'Academic and administrative overview',
    grants: [...readAll, 'audit:read', 'academics:manage', 'assignments:manage', 'exams:publish', 'hr.leave:approve', 'announcements:manage'],
  },
  {
    key: 'ACADEMIC_COORDINATOR',
    name: 'Academic Coordinator',
    description: 'Curriculum and academic management',
    grants: ['school.settings:read', 'dashboard:read', 'academics:read', 'academics:manage', 'grading:read', 'grading:manage',
      'assignments:manage', 'staff:read', 'students:read', 'guardians:read', 'attendance:read', 'homework:read', 'exams:read'],
  },
  {
    key: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'Fee and financial management',
    grants: ['school.settings:read', 'academics:read', 'students:read', 'guardians:read', 'fees:read', 'fees:manage', 'fees:collect'],
  },
  {
    key: 'HR_MANAGER',
    name: 'HR Manager',
    description: 'Staff and leave management',
    grants: ['school.settings:read', 'academics:read', 'staff:read', 'staff:manage', 'accounts:manage', 'hr.leave:read', 'hr.leave:approve'],
  },
  {
    key: 'LIBRARIAN',
    name: 'Librarian',
    description: 'Library management',
    grants: ['school.settings:read', 'academics:read', 'students:read', 'staff:read', 'library:manage'],
  },
  {
    key: 'TRANSPORT_MANAGER',
    name: 'Transport Manager',
    description: 'Transport operations',
    grants: ['school.settings:read', 'academics:read', 'students:read', 'guardians:read', 'transport:manage'],
  },
  {
    key: 'EXAMINATION_CONTROLLER',
    name: 'Examination Controller',
    description: 'Examination administration',
    grants: ['school.settings:read', 'academics:read', 'grading:read', 'grading:manage', 'students:read',
      'exams:read', 'exams:manage', 'exams:enter_marks', 'exams:publish'],
  },
  {
    key: 'TEACHER',
    name: 'Teacher',
    description: 'Access follows the teacher\'s class, subject and department assignments',
    grants: ['school.settings:read', 'academics:read', 'grading:read',
      ['students:read', 'ASSIGNED'], ['guardians:read', 'ASSIGNED'], ['staff:read', 'ASSIGNED'],
      ['attendance:read', 'ASSIGNED'], ['attendance:mark', 'ASSIGNED'],
      ['homework:read', 'ASSIGNED'], ['homework:manage', 'ASSIGNED'],
      ['exams:read', 'ASSIGNED'], ['exams:enter_marks', 'ASSIGNED']],
  },
  {
    key: 'EXAM_COORDINATOR',
    name: 'Examination Coordinator',
    description: 'Teacher who coordinates examination schedules',
    grants: ['exams:read', 'exams:manage', 'grading:read'],
  },
  {
    key: 'STUDENT',
    name: 'Student',
    description: 'Own academic records only',
    grants: ['school.settings:read', 'academics:read', 'grading:read', ['students:read', 'OWN'],
      ['attendance:read', 'OWN'], ['homework:read', 'OWN'], ['exams:read', 'OWN']],
  },
  {
    key: 'GUARDIAN',
    name: 'Parent / Guardian',
    description: 'Records of linked children only',
    grants: ['school.settings:read', 'academics:read', 'grading:read', ['students:read', 'LINKED'], ['guardians:read', 'OWN'],
      ['attendance:read', 'LINKED'], ['homework:read', 'LINKED'], ['exams:read', 'LINKED'], ['fees:read', 'LINKED']],
  },
];

/** Roles whose permissions cannot be edited by a school (prevents lock-out). */
export const LOCKED_ROLE_KEYS = new Set(['SCHOOL_ADMIN']);

export function expandGrants(grants: Grant[]): { permission: Permission; scope: PermissionScope }[] {
  return grants.map((g) => (Array.isArray(g) ? { permission: g[0], scope: g[1] } : { permission: g, scope: 'ALL' }));
}
