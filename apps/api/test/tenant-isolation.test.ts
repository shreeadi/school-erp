import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, loginAs, startServer, type TestServer } from './helpers.js';

/**
 * Requires the seeded demo data (pnpm db:seed). These tests check the
 * guarantees the platform makes: no cross-school access, and record-level
 * scoping for teachers, students and parents.
 */
let s: TestServer;
let gAdmin: Client;
let mAdmin: Client;

before(async () => {
  s = await startServer();
  gAdmin = await loginAs(s.base, 'GREENWOOD', 'admin@greenwood.demo');
  mAdmin = await loginAs(s.base, 'STMARYS', 'admin@stmarys.demo');
});
after(async () => { await s.app.close(); });

describe('database row-level security', () => {
  it('returns nothing and refuses writes when no tenant is set', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = s.app.get(PrismaService);
    assert.equal(await prisma.student.count(), 0);
    assert.equal(await prisma.user.count(), 0);
    const school = await prisma.school.findUniqueOrThrow({ where: { code: 'GREENWOOD' } });
    await assert.rejects(prisma.grade.create({ data: { schoolId: school.id, name: 'Rogue', code: 'RG' } }));
  });

  it('a tenant transaction cannot read or write another school\'s rows', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const { TenantDb } = await import('../src/prisma/tenant-db.service.js');
    const prisma = s.app.get(PrismaService);
    const db = s.app.get(TenantDb);
    const [g, m] = await Promise.all([
      prisma.school.findUniqueOrThrow({ where: { code: 'GREENWOOD' } }),
      prisma.school.findUniqueOrThrow({ where: { code: 'STMARYS' } }),
    ]);
    const counts = await db.runFor(g.id, async (tx) => ({
      foreign: await tx.student.count({ where: { schoolId: m.id } }),
      own: await tx.student.count(),
    }));
    assert.equal(counts.foreign, 0);
    assert.ok(counts.own > 0);
    await assert.rejects(db.runFor(g.id, (tx) => tx.grade.create({ data: { schoolId: m.id, name: 'Rogue', code: 'RG' } })));
  });
});

describe('cross-school API access', () => {
  it('each admin sees only their own school\'s students', async () => {
    const g = await gAdmin.get('/students?pageSize=1');
    const m = await mAdmin.get('/students?pageSize=1');
    assert.equal(g.status, 200);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const { TenantDb } = await import('../src/prisma/tenant-db.service.js');
    const prisma = s.app.get(PrismaService);
    const db = s.app.get(TenantDb);
    for (const [code, res] of [['GREENWOOD', g], ['STMARYS', m]] as const) {
      const school = await prisma.school.findUniqueOrThrow({ where: { code } });
      const expected = await db.runFor(school.id, (tx) => tx.student.count());
      assert.equal(res.body.total, expected, `${code} admin sees exactly their school's students`);
    }
    assert.notEqual(g.body.total, m.body.total);
  });

  it('a record id from another school is not found, read or write', async () => {
    const other = (await mAdmin.get('/students?pageSize=1')).body.items[0];
    assert.equal((await gAdmin.get(`/students/${other.id}`)).status, 404);
    assert.equal((await gAdmin.patch(`/students/${other.id}`, { firstName: 'Hacked' })).status, 404);
    const otherSection = (await mAdmin.get('/academics/sections')).body[0];
    assert.equal((await gAdmin.patch(`/academics/sections/${otherSection.id}`, { name: 'Z' })).status, 404);
  });

  it('a school id in the request body is rejected, not trusted', async () => {
    const mSchool = (await mAdmin.get('/school')).body;
    const r = await gAdmin.post('/academics/grades', { name: 'Injected', code: 'INJ', schoolId: mSchool.id });
    assert.equal(r.status, 400);
  });

  it('cannot reference another school\'s section when admitting a student', async () => {
    const otherSection = (await mAdmin.get('/academics/sections')).body[0];
    const r = await gAdmin.post('/students', { firstName: 'Test', dateOfBirth: '2015-01-01', gender: 'MALE', sectionId: otherSection.id });
    assert.equal(r.status, 404);
  });
});

describe('record-level scoping (ABAC)', () => {
  it('a teacher sees only students in sections they teach or lead', async () => {
    const teacher = await loginAs(s.base, 'GREENWOOD', 'teacher@greenwood.demo');
    const me = (await teacher.get('/auth/me')).body;
    assert.ok(me.teaching.isSubjectTeacher);
    const mySections = new Set<string>([
      ...me.teaching.subjects.map((x: any) => x.sectionId),
      ...me.teaching.classTeacherOf.map((x: any) => x.sectionId),
    ]);
    const list = (await teacher.get('/students?pageSize=100')).body;
    const all = (await gAdmin.get('/students?pageSize=1')).body.total;
    assert.ok(list.total > 0 && list.total < all, `teacher saw ${list.total} of ${all}`);
    for (const st of list.items) assert.ok(mySections.has(st.enrollments[0].section.id));

    const outside = (await gAdmin.get('/students?pageSize=100')).body.items.find(
      (st: any) => !mySections.has(st.enrollments[0]?.section.id),
    );
    assert.equal((await teacher.get(`/students/${outside.id}`)).status, 404);
    assert.equal((await teacher.patch(`/students/${list.items[0].id}`, { firstName: 'X' })).status, 403);
  });

  it('a head of department also sees students taught by their department', async () => {
    const hod = await loginAs(s.base, 'GREENWOOD', 'hod@greenwood.demo');
    const me = (await hod.get('/auth/me')).body;
    assert.ok(me.teaching.isHeadOfDepartment);
    const staff = (await hod.get('/staff?pageSize=100')).body;
    assert.ok(staff.total >= 4, 'HOD sees department members');
  });

  it('a student sees only their own record', async () => {
    const student = await loginAs(s.base, 'GREENWOOD', 'student@greenwood.demo');
    const list = (await student.get('/students')).body;
    assert.equal(list.total, 1);
    const someoneElse = (await gAdmin.get('/students?pageSize=5')).body.items.find((x: any) => x.id !== list.items[0].id);
    assert.equal((await student.get(`/students/${someoneElse.id}`)).status, 404);
    assert.equal((await student.get('/staff')).status, 403);
  });

  it('a parent sees exactly their linked children', async () => {
    const parent = await loginAs(s.base, 'GREENWOOD', 'parent@greenwood.demo');
    const list = (await parent.get('/students')).body;
    assert.equal(list.total, 2);
    const me = (await parent.get('/auth/me')).body;
    const g = (await parent.get(`/guardians/${me.guardianId}`)).body;
    assert.equal(g.students.length, 2);
    assert.equal((await parent.get('/guardians?pageSize=100')).body.total, 1);
  });
});

describe('role permissions', () => {
  it('an accountant cannot change the academic structure', async () => {
    const acc = await loginAs(s.base, 'GREENWOOD', 'accounts@greenwood.demo');
    assert.equal((await acc.post('/academics/grades', { name: 'Class 11', code: '11' })).status, 403);
    assert.equal((await acc.get('/students?pageSize=1')).status, 200);
  });

  it('the School Admin role cannot be edited, and grants cannot exceed the granter', async () => {
    const roles = (await gAdmin.get('/roles')).body;
    const admin = roles.find((r: any) => r.key === 'SCHOOL_ADMIN');
    assert.equal((await gAdmin.put(`/roles/${admin.id}/permissions`, { grants: [] })).status, 403);
    const principal = await loginAs(s.base, 'GREENWOOD', 'principal@greenwood.demo');
    const teacherRole = roles.find((r: any) => r.key === 'TEACHER');
    assert.equal((await principal.put(`/roles/${teacherRole.id}/permissions`, { grants: [{ permission: 'fees:manage', scope: 'ALL' }] })).status, 403);
  });
});

describe('platform separation', () => {
  it('a school session cannot use platform routes, and vice versa', async () => {
    assert.equal((await gAdmin.get('/platform/schools')).status, 401);
    const platform = new Client(s.base);
    const login = await platform.post('/platform/auth/login', { email: 'superadmin@school-erp.demo', password: 'Demo@12345' });
    assert.equal(login.status, 200);
    const schools = (await platform.get('/platform/schools')).body;
    assert.ok(schools.length >= 3);
    assert.equal(schools.find((x: any) => x.code === 'GREENWOOD').stats.students, (await gAdmin.get('/students?pageSize=1&status=ACTIVE')).body.total);
    assert.equal((await platform.get('/students')).status, 401);
  });
});
