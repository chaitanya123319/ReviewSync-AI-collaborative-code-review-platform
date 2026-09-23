#!/usr/bin/env tsx
/**
 * Integration test for ReviewSync AI Backend
 * Tests: register → login → /me → create session → list sessions →
 *        get session → user2 register → user2 join → user2 list → refresh token
 *
 * Usage: npx tsx src/test-integration.ts
 * Requires: backend running on http://localhost:3001
 */

const BASE = process.env.API_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  const ts = Date.now();
  const email1 = `alice-${ts}@test.com`;
  const email2 = `bob-${ts}@test.com`;

  console.log('\n🔧 ReviewSync AI Backend — Integration Tests\n');
  console.log(`Target: ${BASE}`);
  console.log(`Test ID: ${ts}\n`);

  // ──── Health Check ────
  console.log('─── Health Check ───');
  const health = await api('GET', '/health');
  assert(health.status === 200, 'GET /health returns 200');
  assert(health.data.status === 'ok', 'Health status is ok');

  // ──── Register User 1 ────
  console.log('\n─── Register User 1 (Alice) ───');
  const reg1 = await api('POST', '/api/v1/auth/register', {
    name: 'Alice Test',
    email: email1,
    password: 'password123',
  });
  assert(reg1.status === 201, 'Register returns 201');
  assert(typeof reg1.data.accessToken === 'string', 'Has accessToken');
  assert(typeof reg1.data.refreshToken === 'string', 'Has refreshToken');
  assert((reg1.data.user as Record<string, unknown>)?.email === email1, 'User email matches');

  const token1 = reg1.data.accessToken as string;
  const refreshToken1 = reg1.data.refreshToken as string;

  // ──── Register Validation ────
  console.log('\n─── Register Validation ───');
  const regDup = await api('POST', '/api/v1/auth/register', {
    name: 'Alice Dup',
    email: email1,
    password: 'password123',
  });
  assert(regDup.status === 409, 'Duplicate email returns 409');

  const regMissing = await api('POST', '/api/v1/auth/register', {
    email: email1,
  });
  assert(regMissing.status === 400, 'Missing fields returns 400');

  // ──── Login ────
  console.log('\n─── Login User 1 ───');
  const login1 = await api('POST', '/api/v1/auth/login', {
    email: email1,
    password: 'password123',
  });
  assert(login1.status === 200, 'Login returns 200');
  assert(typeof login1.data.accessToken === 'string', 'Has accessToken');
  assert(typeof login1.data.refreshToken === 'string', 'Has refreshToken');

  const loginToken1 = login1.data.accessToken as string;

  // ──── Login Validation ────
  console.log('\n─── Login Validation ───');
  const loginBad = await api('POST', '/api/v1/auth/login', {
    email: email1,
    password: 'wrongpassword',
  });
  assert(loginBad.status === 401, 'Wrong password returns 401');

  const loginNoUser = await api('POST', '/api/v1/auth/login', {
    email: 'nonexistent@test.com',
    password: 'password123',
  });
  assert(loginNoUser.status === 401, 'Nonexistent user returns 401');

  // ──── GET /me ────
  console.log('\n─── GET /me ───');
  const me = await api('GET', '/api/v1/auth/me', undefined, loginToken1);
  assert(me.status === 200, 'GET /me returns 200');
  assert((me.data.user as Record<string, unknown>)?.email === email1, 'Returns correct user');

  const meUnauth = await api('GET', '/api/v1/auth/me');
  assert(meUnauth.status === 401, 'GET /me without token returns 401');

  const meBadToken = await api('GET', '/api/v1/auth/me', undefined, 'invalid-token');
  assert(meBadToken.status === 401, 'GET /me with bad token returns 401');

  // ──── Refresh Token ────
  console.log('\n─── Refresh Token ───');
  const refresh = await api('POST', '/api/v1/auth/refresh', {
    refreshToken: refreshToken1,
  });
  assert(refresh.status === 200, 'Refresh returns 200');
  assert(typeof refresh.data.accessToken === 'string', 'Has new accessToken');
  assert(typeof refresh.data.refreshToken === 'string', 'Has new refreshToken');
  assert(refresh.data.refreshToken !== refreshToken1, 'Refresh token rotated');

  // Old refresh token should be invalid now (rotation)
  const refreshOld = await api('POST', '/api/v1/auth/refresh', {
    refreshToken: refreshToken1,
  });
  assert(refreshOld.status === 401, 'Old refresh token is invalid after rotation');

  const refreshedToken = refresh.data.accessToken as string;

  // ──── Create Session ────
  console.log('\n─── Create Session ───');
  const createSess = await api(
    'POST',
    '/api/v1/sessions',
    { name: 'Sprint 42 Review', projectName: 'reviewsync-backend' },
    refreshedToken,
  );
  assert(createSess.status === 201, 'Create session returns 201');
  const session = createSess.data.session as Record<string, unknown>;
  assert(typeof session.id === 'string', 'Session has id');
  assert(session.name === 'Sprint 42 Review', 'Session name matches');
  assert(session.projectName === 'reviewsync-backend', 'Project name matches');

  const participants = session.participants as Array<Record<string, unknown>>;
  assert(Array.isArray(participants) && participants.length === 1, 'Session has 1 participant');
  assert(participants[0]?.role === 'owner', 'Creator is owner');

  const sessionId = session.id as string;

  // ──── Create Session Validation ────
  console.log('\n─── Create Session Validation ───');
  const createNoAuth = await api('POST', '/api/v1/sessions', {
    name: 'Test',
    projectName: 'test',
  });
  assert(createNoAuth.status === 401, 'Create without auth returns 401');

  const createMissing = await api(
    'POST',
    '/api/v1/sessions',
    { name: 'Test' },
    refreshedToken,
  );
  assert(createMissing.status === 400, 'Create with missing fields returns 400');

  // ──── List Sessions ────
  console.log('\n─── List Sessions ───');
  const list = await api('GET', '/api/v1/sessions', undefined, refreshedToken);
  assert(list.status === 200, 'List sessions returns 200');
  const sessions = (list.data as Record<string, unknown>).sessions as Array<Record<string, unknown>>;
  assert(Array.isArray(sessions) && sessions.length >= 1, 'Has at least 1 session');

  // ──── Get Session by ID ────
  console.log('\n─── Get Session by ID ───');
  const getSess = await api('GET', `/api/v1/sessions/${sessionId}`, undefined, refreshedToken);
  assert(getSess.status === 200, 'Get session returns 200');
  assert((getSess.data.session as Record<string, unknown>)?.id === sessionId, 'Returns correct session');

  // ──── Register User 2 + Join ────
  console.log('\n─── Register User 2 (Bob) & Join Session ───');
  const reg2 = await api('POST', '/api/v1/auth/register', {
    name: 'Bob Test',
    email: email2,
    password: 'password456',
  });
  assert(reg2.status === 201, 'Register User 2 returns 201');
  const token2 = reg2.data.accessToken as string;

  // Bob can't see Alice's session yet
  const getSessBob = await api('GET', `/api/v1/sessions/${sessionId}`, undefined, token2);
  assert(getSessBob.status === 403, 'Non-participant gets 403');

  // Bob joins
  const join = await api('POST', `/api/v1/sessions/${sessionId}/join`, undefined, token2);
  assert(join.status === 200, 'Join session returns 200');
  const joinedParticipants = (join.data.session as Record<string, unknown>)
    ?.participants as Array<Record<string, unknown>>;
  assert(
    Array.isArray(joinedParticipants) && joinedParticipants.length === 2,
    'Session now has 2 participants',
  );

  // Bob can now see it
  const getSessBob2 = await api('GET', `/api/v1/sessions/${sessionId}`, undefined, token2);
  assert(getSessBob2.status === 200, 'Participant can now GET session');

  // Bob can list and see it
  const listBob = await api('GET', '/api/v1/sessions', undefined, token2);
  const bobSessions = (listBob.data as Record<string, unknown>).sessions as Array<Record<string, unknown>>;
  assert(
    Array.isArray(bobSessions) && bobSessions.some((s) => s.id === sessionId),
    'Session appears in Bob\'s list',
  );

  // Duplicate join
  const joinDup = await api('POST', `/api/v1/sessions/${sessionId}/join`, undefined, token2);
  assert(joinDup.status === 409, 'Duplicate join returns 409');

  // ──── Summary ────
  console.log('\n═══════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Test runner crashed:', err.message || err);
  process.exit(1);
});
