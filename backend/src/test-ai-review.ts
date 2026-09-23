/**
 * Integration test for AI Review pipeline:
 *   1. Register user, create session, upload a file with a known bug
 *   2. Trigger POST /files/:fileId/ai-review
 *   3. Verify issues are stored via GET /files/:fileId/ai-issues
 *   4. PATCH an issue to "accepted" and verify
 */

const API = process.env.API_URL || 'http://localhost:3001';
const TEST_ID = Date.now();

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log('\n🤖 AI Review Pipeline — Integration Tests\n');
  console.log(`Target: ${API}`);
  console.log(`Test ID: ${TEST_ID}\n`);

  // ─── Setup ───
  console.log('─── Setup: Register + Session + File ───');

  const { data: regData } = await api('POST', '/api/v1/auth/register', {
    name: `AITest-${TEST_ID}`,
    email: `aitest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const token = regData.accessToken;
  assert(!!token, 'Registered and got token');

  const { data: sessData } = await api('POST', '/api/v1/sessions', {
    name: `AI Review Test ${TEST_ID}`,
    projectName: 'test',
  }, token);
  const sessionId = sessData.session.id;

  // Upload a file with a known SQL injection bug
  const buggyCode = `const express = require('express');
const app = express();
const unusedVar = 42;

app.get('/users', async (req, res) => {
  const id = req.query.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  const result = await db.query(query);
  res.json(result.rows);
});

app.listen(3000);
`;

  const { status: fileStatus, data: fileData } = await api('POST', `/api/v1/sessions/${sessionId}/files`, {
    filename: 'buggy.js',
    language: 'javascript',
    content: buggyCode,
  }, token);
  assert(fileStatus === 201, 'File uploaded');
  const fileId = fileData.file.id;

  // ─── Trigger AI Review ───
  console.log('\n─── POST /files/:fileId/ai-review ───');
  console.log('  ⏳ Calling AI service (may take up to 60s)...');

  const startTime = Date.now();
  const { status: reviewStatus, data: reviewData } = await api(
    'POST',
    `/api/v1/files/${fileId}/ai-review`,
    {},
    token,
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱️  Completed in ${elapsed}s`);

  assert(reviewStatus === 200, `AI review returns 200 (got ${reviewStatus})`);

  if (reviewStatus !== 200) {
    console.log(`  🛑 Error detail: ${JSON.stringify(reviewData).slice(0, 300)}`);
    console.log(`\n${'═'.repeat(40)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`${'═'.repeat(40)}\n`);
    process.exit(1);
  }

  assert(Array.isArray(reviewData.issues), 'Response has issues array');
  assert(reviewData.issues.length >= 1, `At least 1 issue found (got ${reviewData.issues.length})`);

  // Check issue fields
  if (reviewData.issues.length > 0) {
    const issue = reviewData.issues[0];
    assert(typeof issue.id === 'string', 'Issue has DB id');
    assert(typeof issue.line === 'number', 'Issue has line number');
    assert(typeof issue.severity === 'string', 'Issue has severity');
    assert(typeof issue.title === 'string', 'Issue has title');
    assert(issue.status === 'pending', 'Issue status is pending');
    assert(issue.fileId === fileId, 'Issue belongs to correct file');
  }

  // Check for SQL injection detection
  const hasSqlInjection = reviewData.issues.some(
    (i: any) => i.type === 'security' && i.severity === 'critical',
  );
  assert(hasSqlInjection, 'SQL injection flagged as critical security issue');

  // ─── GET stored issues ───
  console.log('\n─── GET /files/:fileId/ai-issues ───');

  const { status: getStatus, data: getData } = await api(
    'GET',
    `/api/v1/files/${fileId}/ai-issues`,
    undefined,
    token,
  );
  assert(getStatus === 200, 'GET ai-issues returns 200');
  assert(getData.issues.length === reviewData.issues.length, 'Stored count matches review count');

  // ─── PATCH: accept an issue ───
  console.log('\n─── PATCH /ai-issues/:id — Accept ───');

  const issueId = reviewData.issues[0].id;
  const { status: patchStatus, data: patchData } = await api(
    'PATCH',
    `/api/v1/ai-issues/${issueId}`,
    { status: 'accepted' },
    token,
  );
  assert(patchStatus === 200, 'PATCH returns 200');
  assert(patchData.issue.status === 'accepted', 'Status updated to accepted');

  // ─── PATCH: reject another ───
  if (reviewData.issues.length >= 2) {
    console.log('\n─── PATCH /ai-issues/:id — Reject ───');
    const issueId2 = reviewData.issues[1].id;
    const { status: p2Status, data: p2Data } = await api(
      'PATCH',
      `/api/v1/ai-issues/${issueId2}`,
      { status: 'rejected' },
      token,
    );
    assert(p2Status === 200, 'PATCH reject returns 200');
    assert(p2Data.issue.status === 'rejected', 'Status updated to rejected');
  }

  // ─── PATCH: invalid status ───
  console.log('\n─── PATCH validation ───');
  const { status: badStatus } = await api(
    'PATCH',
    `/api/v1/ai-issues/${issueId}`,
    { status: 'invalid' },
    token,
  );
  assert(badStatus === 400, `Invalid status returns 400 (got ${badStatus})`);

  // ─── Verify final state in DB ───
  console.log('\n─── Final DB state ───');
  const { data: finalData } = await api(
    'GET',
    `/api/v1/files/${fileId}/ai-issues`,
    undefined,
    token,
  );
  const accepted = finalData.issues.filter((i: any) => i.status === 'accepted').length;
  const rejected = finalData.issues.filter((i: any) => i.status === 'rejected').length;
  const pending = finalData.issues.filter((i: any) => i.status === 'pending').length;
  console.log(`  📊 accepted=${accepted} rejected=${rejected} pending=${pending}`);
  assert(accepted >= 1, 'At least 1 accepted issue');

  // ─── Summary ───
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
