/**
 * Integration test for GET /api/v1/sessions/:id/dashboard
 *
 * Creates a session with a file, adds comments (some resolved),
 * adds AI issues (some accepted/rejected), then fetches the dashboard
 * and verifies the aggregated counts match.
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
  console.log('\n📊 Dashboard Endpoint — Integration Tests\n');

  // ─── Setup ───
  console.log('─── Setup ───');

  const { data: regData } = await api('POST', '/api/v1/auth/register', {
    name: `DashTest-${TEST_ID}`,
    email: `dashtest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const token = regData.accessToken;

  const { data: sessData } = await api('POST', '/api/v1/sessions',
    { name: `Dashboard Test ${TEST_ID}`, projectName: 'dashtest' }, token);
  const sessionId = sessData.session.id;

  // Upload a file
  const { data: fileData } = await api('POST', `/api/v1/sessions/${sessionId}/files`, {
    filename: 'test.js',
    language: 'javascript',
    content: 'const x = 1;\nconst y = 2;\nconst z = x + y;\n',
  }, token);
  const fileId = fileData.file.id;

  // Add 3 root comments
  const { data: c1 } = await api('POST', `/api/v1/files/${fileId}/comments`,
    { line: 1, body: 'Comment 1' }, token);
  await api('POST', `/api/v1/files/${fileId}/comments`,
    { line: 2, body: 'Comment 2' }, token);
  const { data: c3 } = await api('POST', `/api/v1/files/${fileId}/comments`,
    { line: 3, body: 'Comment 3' }, token);

  // Add a reply (should NOT count as root thread)
  await api('POST', `/api/v1/files/${fileId}/comments`,
    { line: 1, body: 'Reply to c1', parentCommentId: c1.comment.id }, token);

  // Resolve 2 comments
  await api('PATCH', `/api/v1/comments/${c1.comment.id}/resolve`, {}, token);
  await api('PATCH', `/api/v1/comments/${c3.comment.id}/resolve`, {}, token);

  // Manually create AI issues via the AI review endpoint won't work without the AI service
  // So we'll create them via direct DB-like calls through the file ai-review endpoint
  // Instead, let's just create the file and call ai-review if AI service is available,
  // or use direct issue creation if available.

  // Upload a buggy file and trigger AI review
  const { data: buggyFile } = await api('POST', `/api/v1/sessions/${sessionId}/files`, {
    filename: 'buggy.js',
    language: 'javascript',
    content: `const express = require('express');\nconst unused = 42;\napp.get('/users', (req, res) => {\n  const q = "SELECT * FROM users WHERE id = '" + req.query.id + "'";\n  db.query(q).then(r => res.json(r));\n});\n`,
  }, token);
  const buggyFileId = buggyFile.file.id;

  console.log('  ⏳ Running AI review (may take ~10s)...');
  const { status: aiStatus, data: aiData } = await api(
    'POST', `/api/v1/files/${buggyFileId}/ai-review`, {}, token);

  let totalAiIssues = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  if (aiStatus === 200 && aiData.issues) {
    totalAiIssues = aiData.issues.length;
    criticalCount = aiData.issues.filter((i: any) => i.severity === 'critical').length;
    warningCount = aiData.issues.filter((i: any) => i.severity === 'warning').length;
    infoCount = aiData.issues.filter((i: any) => i.severity === 'info').length;
    console.log(`  AI found ${totalAiIssues} issues (${criticalCount}C ${warningCount}W ${infoCount}I)`);

    // Accept the first issue, reject the second (if exists)
    if (aiData.issues.length >= 1) {
      await api('PATCH', `/api/v1/ai-issues/${aiData.issues[0].id}`,
        { status: 'accepted' }, token);
    }
    if (aiData.issues.length >= 2) {
      await api('PATCH', `/api/v1/ai-issues/${aiData.issues[1].id}`,
        { status: 'rejected' }, token);
    }
  } else {
    console.log(`  ⚠️  AI review failed (status ${aiStatus}), testing with 0 issues`);
  }

  // ─── Fetch dashboard ───
  console.log('\n─── GET /sessions/:id/dashboard ───');

  const { status, data } = await api('GET', `/api/v1/sessions/${sessionId}/dashboard`, undefined, token);

  assert(status === 200, `Returns 200 (got ${status})`);
  assert(data.sessionName === `Dashboard Test ${TEST_ID}`, 'Session name correct');
  assert(data.totalFiles === 2, `totalFiles = 2 (got ${data.totalFiles})`);

  // Comment assertions: 3 root threads, 2 resolved, 1 unresolved
  assert(data.totalComments === 3, `totalComments = 3 (got ${data.totalComments})`);
  assert(data.resolvedComments === 2, `resolvedComments = 2 (got ${data.resolvedComments})`);
  assert(data.unresolvedComments === 1, `unresolvedComments = 1 (got ${data.unresolvedComments})`);

  // AI issue assertions
  assert(data.totalIssues === totalAiIssues, `totalIssues = ${totalAiIssues} (got ${data.totalIssues})`);
  assert(data.criticalIssues === criticalCount, `criticalIssues = ${criticalCount} (got ${data.criticalIssues})`);

  if (totalAiIssues >= 1) {
    assert(data.acceptedIssues === 1, `acceptedIssues = 1 (got ${data.acceptedIssues})`);
  }
  if (totalAiIssues >= 2) {
    assert(data.rejectedIssues === 1, `rejectedIssues = 1 (got ${data.rejectedIssues})`);
    assert(data.pendingIssues === totalAiIssues - 2, `pendingIssues = ${totalAiIssues - 2} (got ${data.pendingIssues})`);
  }

  // Progress
  const totalItems = 3 + totalAiIssues;
  const handledItems = 2 + Math.min(totalAiIssues, 1) + Math.min(Math.max(totalAiIssues - 1, 0), 1);
  const expectedProgress = Math.round((handledItems / totalItems) * 100);
  assert(data.reviewProgress === expectedProgress,
    `reviewProgress = ${expectedProgress}% (got ${data.reviewProgress}%)`);

  // Severity breakdown
  assert(Array.isArray(data.issuesBySeverity), 'issuesBySeverity is array');
  assert(Array.isArray(data.issuesByType), 'issuesByType is array');

  // ─── Verify non-participant gets 403 ───
  console.log('\n─── Access control ───');
  const { data: reg2 } = await api('POST', '/api/v1/auth/register', {
    name: `Other-${TEST_ID}`,
    email: `other-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const { status: forbiddenStatus } = await api(
    'GET', `/api/v1/sessions/${sessionId}/dashboard`, undefined, reg2.accessToken);
  assert(forbiddenStatus === 403, `Non-participant gets 403 (got ${forbiddenStatus})`);

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
