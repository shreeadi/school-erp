import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, loginAs, startServer, type TestServer } from './helpers.js';

let s: TestServer;
let admin: Client;
const stamp = Date.now().toString(36).toUpperCase();

before(async () => {
  s = await startServer();
  admin = await loginAs(s.base, 'SUNRISE', 'admin@sunrise.demo');
});
after(async () => { await s.app.close(); });

describe('authentication', () => {
  it('rejects bad credentials with one generic message', async () => {
    const c = new Client(s.base);
    const a = await c.post('/auth/login', { schoolCode: 'SUNRISE', email: 'admin@sunrise.demo', password: 'wrong-password1' });
    const b = await c.post('/auth/login', { schoolCode: 'SUNRISE', email: 'nobody@sunrise.demo', password: 'wrong-password1' });
    const d = await c.post('/auth/login', { schoolCode: 'NOSUCH', email: 'admin@sunrise.demo', password: 'wrong-password1' });
    assert.deepEqual([a.status, b.status, d.status], [401, 401, 401]);
    assert.equal(a.body.message, b.body.message);
    assert.equal(a.body.message, d.body.message);
  });

  it('locks an account after repeated failures', async () => {
    const created = await admin.post('/staff', {
      fullName: 'Lockout Tester', email: `lock.${stamp.toLowerCase()}@sunrise.demo`, employeeCode: `L${stamp}`.slice(0, 20), designation: 'Clerk', staffType: 'NON_TEACHING',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const email = `lock.${stamp.toLowerCase()}@sunrise.demo`;
    const c = new Client(s.base);
    for (let i = 0; i < 5; i++) await c.post('/auth/login', { schoolCode: 'SUNRISE', email, password: 'wrong-password1' });
    const r = await c.post('/auth/login', { schoolCode: 'SUNRISE', email, password: created.body.temporaryPassword });
    assert.equal(r.status, 401);
    assert.match(r.body.message, /Too many failed attempts/);
  });

  it('logout revokes the session server-side', async () => {
    const c = await loginAs(s.base, 'SUNRISE', 'library@sunrise.demo');
    const cookie = c.cookie;
    assert.equal((await c.get('/auth/me')).status, 200);
    assert.equal((await c.post('/auth/logout')).status, 204);
    c.cookie = cookie; // replay the old cookie
    assert.equal((await c.get('/auth/me')).status, 401);
  });

  it('refuses cookie-authenticated writes from a foreign origin', async () => {
    const r = await admin.req('POST', '/api/v1/academics/grades', { name: 'X', code: 'X1' }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  });
});

describe('admissions and academic configuration', () => {
  it('admits a student with an auto admission number, enrollment and guardians', async () => {
    const section = (await admin.get('/academics/sections')).body[0];
    const r = await admin.post('/students', {
      firstName: 'Kavya', lastName: 'Test', dateOfBirth: '2019-07-10', gender: 'FEMALE', sectionId: section.id,
      guardians: [{ relationship: 'MOTHER', isPrimary: true, guardian: { fullName: 'Meena Test', phone: '+919800000001' } }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.admissionNumber, /^SUNR\d{4}\/\d{4}$/);
    const detail = (await admin.get(`/students/${r.body.id}`)).body;
    assert.equal(detail.enrollments[0].section.id, section.id);
    assert.equal(detail.guardians[0].guardian.fullName, 'Meena Test');
    const audit = (await admin.get('/audit-logs?pageSize=20')).body.items;
    assert.ok(audit.some((x: any) => x.action === 'student.admitted' && x.entityId === r.body.id));
  });

  it('rejects overlapping grading bands', async () => {
    const r = await admin.post('/grading/scales', {
      name: `Bad ${stamp}`, type: 'PERCENTAGE_BANDS', bands: [{ label: 'A', minPercent: 50, maxPercent: 100 }, { label: 'B', minPercent: 0, maxPercent: 60 }],
    });
    assert.equal(r.status, 400);
  });

  it('lets each school define its own grading scale', async () => {
    const r = await admin.post('/grading/scales', {
      name: `Custom ${stamp}`, type: 'DESCRIPTIVE', passPercent: 40,
      bands: [{ label: 'Outstanding', minPercent: 85, maxPercent: 100 }, { label: 'Developing', minPercent: 40, maxPercent: 84.99 }, { label: 'Beginning', minPercent: 0, maxPercent: 39.99 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.bands.length, 3);
    const other = await loginAs(s.base, 'GREENWOOD', 'admin@greenwood.demo');
    const theirs = (await other.get('/grading/scales')).body;
    assert.ok(!theirs.some((x: any) => x.name === `Custom ${stamp}`));
  });

  it('only assigns teachers to subjects in the class curriculum', async () => {
    const sections = (await admin.get('/academics/sections')).body;
    const class1 = sections.find((x: any) => x.grade.code === '1');
    const subjects = (await admin.get('/academics/subjects')).body;
    const science = subjects.find((x: any) => x.code === 'SCI'); // Classes 6-10 only
    const teacher = (await admin.get('/staff?staffType=TEACHING&pageSize=1')).body.items[0];
    const r = await admin.post(`/staff/${teacher.id}/assignments`, { sectionId: class1.id, subjectId: science.id });
    assert.equal(r.status, 400);
  });
});
