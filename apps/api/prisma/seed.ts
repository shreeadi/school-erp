/**
 * Synthetic demo data: three schools on different boards, each fully isolated.
 * All names, phone numbers and addresses are generated; none belong to real people.
 *
 * Usage: pnpm --filter @school-erp/api db:seed       (idempotent: existing schools are skipped)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { fakerEN_IN as faker } from '@faker-js/faker';

process.env.ENABLE_JOBS = 'false';

const { AppModule } = await import('../src/app.module.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');
const { TenantDb } = await import('../src/prisma/tenant-db.service.js');
const { ProvisioningService } = await import('../src/modules/platform/provisioning.service.js');
const { hashPassword } = await import('../src/modules/auth/crypto.js');

type Tx = import('../src/prisma/tenant-db.service.js').Tx;
type Board = import('../src/generated/prisma/enums.js').Board;

export const DEMO_PASSWORD = 'Demo@12345';

interface SchoolSeed {
  code: string; name: string; board: Board; boardName?: string; city: string; state: string; domain: string;
  secondLanguage: string; sectionsPerGrade: number; studentsPerSection: number; seed: number;
}

const SCHOOLS: SchoolSeed[] = [
  { code: 'GREENWOOD', name: 'Greenwood International School', board: 'CBSE', city: 'Bengaluru', state: 'Karnataka', domain: 'greenwood.demo', secondLanguage: 'Hindi', sectionsPerGrade: 2, studentsPerSection: 18, seed: 101 },
  { code: 'STMARYS', name: "St. Mary's Convent School", board: 'ICSE', city: 'Pune', state: 'Maharashtra', domain: 'stmarys.demo', secondLanguage: 'Marathi', sectionsPerGrade: 2, studentsPerSection: 15, seed: 202 },
  { code: 'SUNRISE', name: 'Sunrise Matriculation School', board: 'STATE_BOARD', boardName: 'Tamil Nadu State Board', city: 'Chennai', state: 'Tamil Nadu', domain: 'sunrise.demo', secondLanguage: 'Tamil', sectionsPerGrade: 3, studentsPerSection: 16, seed: 303 },
];

const ADMIN_PERSONAS: { role: string; local: string; designation: string }[] = [
  { role: 'SCHOOL_ADMIN', local: 'admin', designation: 'School Administrator' },
  { role: 'PRINCIPAL', local: 'principal', designation: 'Principal' },
  { role: 'ACADEMIC_COORDINATOR', local: 'academic', designation: 'Academic Coordinator' },
  { role: 'ACCOUNTANT', local: 'accounts', designation: 'Accountant' },
  { role: 'HR_MANAGER', local: 'hr', designation: 'HR Manager' },
  { role: 'LIBRARIAN', local: 'library', designation: 'Librarian' },
  { role: 'TRANSPORT_MANAGER', local: 'transport', designation: 'Transport Manager' },
  { role: 'EXAMINATION_CONTROLLER', local: 'exams', designation: 'Examination Controller' },
];

const DEPARTMENTS = ['Languages', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Arts & Physical Education'] as const;

function subjectsFor(secondLanguage: string) {
  return [
    { code: 'ENG', name: 'English', type: 'LANGUAGE', dept: 'Languages', grades: 'all' },
    { code: 'L2', name: secondLanguage, type: 'LANGUAGE', dept: 'Languages', grades: 'all' },
    { code: 'MATH', name: 'Mathematics', type: 'CORE', dept: 'Mathematics', grades: 'all' },
    { code: 'EVS', name: 'Environmental Studies', type: 'CORE', dept: 'Science', grades: 'primary' },
    { code: 'SCI', name: 'Science', type: 'CORE', dept: 'Science', grades: 'secondary' },
    { code: 'SST', name: 'Social Science', type: 'CORE', dept: 'Social Science', grades: 'secondary' },
    { code: 'COMP', name: 'Computer Science', type: 'ELECTIVE', dept: 'Computer Science', grades: 'all' },
    { code: 'ART', name: 'Art & Craft', type: 'CO_SCHOLASTIC', dept: 'Arts & Physical Education', grades: 'primary' },
    { code: 'PE', name: 'Physical Education', type: 'CO_SCHOLASTIC', dept: 'Arts & Physical Education', grades: 'all' },
  ] as const;
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const prisma = app.get(PrismaService);
const db = app.get(TenantDb);
const provisioning = app.get(ProvisioningService);
const passwordHash = await hashPassword(DEMO_PASSWORD);

async function ensurePlatformAdmin() {
  const email = 'superadmin@school-erp.demo';
  await prisma.platformAdmin.upsert({ where: { email }, update: {}, create: { email, fullName: 'Platform Super Admin', passwordHash } });
}

async function seedSchool(s: SchoolSeed) {
  if (await prisma.school.findUnique({ where: { code: s.code } })) {
    console.log(`• ${s.code} already exists, skipping`);
    return;
  }
  faker.seed(s.seed);
  const { school } = await provisioning.provisionSchool({
    code: s.code, name: s.name, board: s.board, boardName: s.boardName, city: s.city, state: s.state,
    admin: { fullName: faker.person.fullName(), email: `admin@${s.domain}`, password: DEMO_PASSWORD },
  });
  const schoolId = school.id;

  await db.runFor(schoolId, async (tx: Tx) => {
    const roles = new Map((await tx.role.findMany()).map((r) => [r.key, r.id]));
    let emp = 1;
    const empCode = () => `EMP${String(emp++).padStart(4, '0')}`;

    const createStaffUser = async (p: { email: string; fullName: string; designation: string; type: 'TEACHING' | 'NON_TEACHING'; roleKeys: string[]; departmentId?: string }) => {
      const user = await tx.user.create({
        data: { schoolId, email: p.email, fullName: p.fullName, phone: `+91${faker.string.numeric({ length: 10, allowLeadingZeros: false })}`, userType: 'STAFF', passwordHash },
      });
      if (p.roleKeys.length) await tx.userRole.createMany({ data: p.roleKeys.map((k) => ({ schoolId, userId: user.id, roleId: roles.get(k)! })) });
      return tx.staffProfile.create({
        data: {
          schoolId, userId: user.id, employeeCode: empCode(), designation: p.designation, staffType: p.type, departmentId: p.departmentId,
          qualifications: p.type === 'TEACHING' ? faker.helpers.arrayElement(['M.Sc., B.Ed.', 'M.A., B.Ed.', 'B.Sc., B.Ed.', 'M.Com., B.Ed.', 'B.A., B.Ed.']) : faker.helpers.arrayElement(['B.Com.', 'MBA', 'B.A.', 'M.Lib.Sc.']),
          dateOfJoining: faker.date.between({ from: '2012-06-01', to: '2025-06-01' }),
        },
      });
    };

    // School Admin profile (user created during provisioning) + one account per admin role.
    const adminUser = await tx.user.findFirstOrThrow({ where: { email: `admin@${s.domain}` } });
    await tx.staffProfile.create({ data: { schoolId, userId: adminUser.id, employeeCode: empCode(), designation: 'School Administrator', staffType: 'NON_TEACHING' } });
    for (const p of ADMIN_PERSONAS.slice(1)) {
      await createStaffUser({ email: `${p.local}@${s.domain}`, fullName: faker.person.fullName(), designation: p.designation, type: 'NON_TEACHING', roleKeys: [p.role] });
    }

    // Academic years
    await tx.academicYear.create({ data: { schoolId, name: '2025-26', startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31') } });
    const year = await tx.academicYear.create({ data: { schoolId, name: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isCurrent: true } });

    // Departments and teachers
    const deptIds = new Map<string, string>();
    for (const name of DEPARTMENTS) deptIds.set(name, (await tx.department.create({ data: { schoolId, name } })).id);

    const teachersByDept = new Map<string, { id: string }[]>();
    const usedEmails = new Set<string>();
    const teacherCount: Record<(typeof DEPARTMENTS)[number], number> = {
      Languages: 6, Mathematics: 4, Science: 4, 'Social Science': 2, 'Computer Science': 2, 'Arts & Physical Education': 2,
    };
    for (const dept of DEPARTMENTS) {
      const list: { id: string }[] = [];
      for (let i = 0; i < teacherCount[dept]; i++) {
        const first = faker.person.firstName(); const last = faker.person.lastName();
        let email = dept === 'Languages' && i === 1 ? `teacher@${s.domain}` : `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${s.domain}`;
        while (usedEmails.has(email)) email = email.replace('@', `${faker.number.int(9)}@`);
        usedEmails.add(email);
        if (i === 0 && dept === 'Science') email = `hod@${s.domain}`;
        const staff = await createStaffUser({
          email, fullName: `${first} ${last}`, designation: i === 0 ? `Senior Teacher, ${dept}` : `Teacher, ${dept}`, type: 'TEACHING', roleKeys: ['TEACHER'], departmentId: deptIds.get(dept),
        });
        list.push(staff);
      }
      teachersByDept.set(dept, list);
      // First teacher of each department is its Head of Department.
      await tx.department.update({ where: { id: deptIds.get(dept)! }, data: { headId: list[0].id } });
    }
    // One mathematics teacher also coordinates examinations.
    const examCoordinator = teachersByDept.get('Mathematics')![1];
    const ecUser = await tx.staffProfile.findUniqueOrThrow({ where: { id: examCoordinator.id } });
    await tx.userRole.create({ data: { schoolId, userId: ecUser.userId, roleId: roles.get('EXAM_COORDINATOR')! } });

    // Subjects
    const subjects = subjectsFor(s.secondLanguage);
    const subjectIds = new Map<string, string>();
    for (const sub of subjects) {
      subjectIds.set(sub.code, (await tx.subject.create({ data: { schoolId, code: sub.code, name: sub.name, type: sub.type, departmentId: deptIds.get(sub.dept) } })).id);
    }
    const defaultScale = await tx.gradingScale.findFirst({ where: { isDefault: true } });

    // Grades, sections, curriculum, class teachers, subject teachers
    const allTeachers = [...teachersByDept.values()].flat();
    let classTeacherIdx = 0;
    const rr = new Map<string, number>();
    const sections: { id: string; gradeNo: number }[] = [];
    for (let g = 1; g <= 10; g++) {
      const grade = await tx.grade.create({ data: { schoolId, name: `Class ${g}`, code: String(g), sortOrder: g } });
      const gradeSubjects = subjects.filter((x) => x.grades === 'all' || (x.grades === 'primary' ? g <= 5 : g > 5));
      await tx.gradeSubject.createMany({
        data: gradeSubjects.map((x) => ({
          schoolId, academicYearId: year.id, gradeId: grade.id, subjectId: subjectIds.get(x.code)!, isElective: x.type === 'ELECTIVE',
          periodsPerWeek: x.type === 'CO_SCHOLASTIC' ? 2 : x.code === 'MATH' ? 7 : 5, gradingScaleId: x.type === 'CO_SCHOLASTIC' ? null : defaultScale?.id,
        })),
      });
      for (let si = 0; si < s.sectionsPerGrade; si++) {
        const classTeacher = allTeachers[classTeacherIdx++ % allTeachers.length];
        const section = await tx.section.create({
          data: { schoolId, academicYearId: year.id, gradeId: grade.id, name: String.fromCharCode(65 + si), capacity: 40, room: `${g}${String.fromCharCode(65 + si)}`, classTeacherId: classTeacher.id },
        });
        sections.push({ id: section.id, gradeNo: g });
        for (const x of gradeSubjects) {
          const pool = teachersByDept.get(x.dept)!;
          const n = rr.get(x.dept) ?? 0; rr.set(x.dept, n + 1);
          await tx.teachingAssignment.create({ data: { schoolId, academicYearId: year.id, staffId: pool[n % pool.length].id, sectionId: section.id, subjectId: subjectIds.get(x.code)! } });
        }
      }
    }

    // Students and guardians
    let admission = 1;
    let firstStudent = true;
    let siblingGuardian: { fatherId: string; motherId: string; lastName: string } | null = null;
    let siblingLinked = false;
    const accountsToCreate: { kind: 'student' | 'guardian'; id: string; email: string; fullName: string }[] = [];
    const prefix = s.code.slice(0, 4);
    for (const sec of sections) {
      const strength = s.studentsPerSection + faker.number.int({ min: -4, max: 4 });
      for (let r = 1; r <= strength; r++) {
        const sex = faker.helpers.arrayElement(['male', 'female'] as const);
        const lastName = faker.person.lastName();
        const birthYear = 2026 - 6 - sec.gradeNo;
        const student = await tx.student.create({
          data: {
            schoolId, admissionNumber: `${prefix}${2027 - sec.gradeNo}/${String(admission++).padStart(4, '0')}`,
            firstName: faker.person.firstName(sex), lastName, gender: sex === 'male' ? 'MALE' : 'FEMALE',
            dateOfBirth: faker.date.between({ from: `${birthYear}-04-01`, to: `${birthYear + 1}-03-31` }),
            bloodGroup: faker.helpers.arrayElement(['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-']),
            admissionDate: new Date(`${2027 - sec.gradeNo}-04-0${faker.number.int({ min: 1, max: 9 })}`),
            addressLine1: faker.location.streetAddress(), city: s.city, state: s.state, postalCode: faker.string.numeric(6).replace(/^0/, '6'),
          },
        });
        await tx.enrollment.create({ data: { schoolId, studentId: student.id, academicYearId: year.id, sectionId: sec.id, rollNumber: r } });

        // The second student in Class 9 A is a sibling of the first student in Class 7 A, sharing parents.
        const isSiblingPair = sec.gradeNo === 9 && r === 2 && siblingGuardian && !siblingLinked;
        if (isSiblingPair && siblingGuardian) {
          siblingLinked = true;
          await tx.studentGuardian.createMany({ data: [
            { schoolId, studentId: student.id, guardianId: siblingGuardian.fatherId, relationship: 'FATHER', isPrimary: true },
            { schoolId, studentId: student.id, guardianId: siblingGuardian.motherId, relationship: 'MOTHER' },
          ] });
          await tx.student.update({ where: { id: student.id }, data: { lastName: siblingGuardian.lastName } });
          continue;
        }
        const father = await tx.guardian.create({ data: {
          schoolId, fullName: `${faker.person.firstName('male')} ${lastName}`, phone: `+91${faker.string.numeric({ length: 10, allowLeadingZeros: false })}`,
          occupation: faker.person.jobTitle(),
        } });
        const mother = await tx.guardian.create({ data: {
          schoolId, fullName: `${faker.person.firstName('female')} ${lastName}`, phone: `+91${faker.string.numeric({ length: 10, allowLeadingZeros: false })}`,
          occupation: faker.person.jobTitle(),
        } });
        await tx.studentGuardian.createMany({ data: [
          { schoolId, studentId: student.id, guardianId: father.id, relationship: 'FATHER', isPrimary: true },
          { schoolId, studentId: student.id, guardianId: mother.id, relationship: 'MOTHER' },
        ] });
        if (sec.gradeNo === 7 && r === 1 && !siblingGuardian) {
          siblingGuardian = { fatherId: father.id, motherId: mother.id, lastName };
          accountsToCreate.push({ kind: 'guardian', id: father.id, email: `parent@${s.domain}`, fullName: father.fullName });
        }
        if (firstStudent && sec.gradeNo === 7) {
          firstStudent = false;
          accountsToCreate.push({ kind: 'student', id: student.id, email: `student@${s.domain}`, fullName: `${student.firstName} ${lastName}` });
        }
      }
    }

    // Demo portal accounts for one student and one parent (with two children).
    for (const acc of accountsToCreate) {
      const user = await tx.user.create({
        data: { schoolId, email: acc.email, fullName: acc.fullName, userType: acc.kind === 'student' ? 'STUDENT' : 'GUARDIAN', passwordHash },
      });
      await tx.userRole.create({ data: { schoolId, userId: user.id, roleId: roles.get(acc.kind === 'student' ? 'STUDENT' : 'GUARDIAN')! } });
      if (acc.kind === 'student') await tx.student.update({ where: { id: acc.id }, data: { userId: user.id } });
      else await tx.guardian.update({ where: { id: acc.id }, data: { userId: user.id, email: acc.email } });
    }
  }, { timeoutMs: 180_000 });

  const counts = await db.runFor(schoolId, async (tx: Tx) => ({
    students: await tx.student.count(), staff: await tx.staffProfile.count(), sections: await tx.section.count(), guardians: await tx.guardian.count(),
  }));
  console.log(`✓ ${s.code}: ${counts.students} students, ${counts.staff} staff, ${counts.sections} sections, ${counts.guardians} guardians`);
}

try {
  await ensurePlatformAdmin();
  for (const s of SCHOOLS) await seedSchool(s);
  console.log(`\nDemo password for every account: ${DEMO_PASSWORD}`);
} finally {
  await app.close();
}
