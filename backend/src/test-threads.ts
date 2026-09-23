/**
 * Integration test for threaded comments:
 *   1. Register a user, create a session, upload a file
 *   2. Post a root comment on line 5
 *   3. Post a reply to that comment
 *   4. Verify thread structure in GET response
 *   5. Resolve the root comment
 *   6. Verify resolved state in GET response
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
  console.log('\n🔧 Threaded Comments — Integration Tests\n');
  console.log(`Target: ${API}`);
  console.log(`Test ID: ${TEST_ID}\n`);

  // ─── Register & Login ───
  console.log('─── Setup: Register + Session + File ───');

  const { status: regStatus, data: regData } = await api('POST', '/api/v1/auth/register', {
    name: `Alice-${TEST_ID}`,
    email: `alice-${TEST_ID}@test.com`,
    password: 'password123',
  });
  assert(regStatus === 201, `Register returns 201 (got ${regStatus})`);
  const token = regData.accessToken;
  assert(!!token, 'Has accessToken');

  // Create session
  const { status: sessStatus, data: sessData } = await api('POST', '/api/v1/sessions', {
    name: `Thread Test Session ${TEST_ID}`,
    projectName: 'test-project',
  }, token);
  assert(sessStatus === 201, `Create session returns 201`);
  const sessionId = sessData.session.id;

  // Upload a file via POST /sessions/:id/files
  const fileContent = `function hello() {\n  console.log("Hello");\n}\n\nfunction add(a, b) {\n  return a + b;\n}\n\nfunction greet(name) {\n  return "Hi " + name;\n}\n`;
  const { status: fileStatus, data: fileData } = await api('POST', `/api/v1/sessions/${sessionId}/files`, {
    filename: 'example.js',
    language: 'javascript',
    content: fileContent,
  }, token);
  assert(fileStatus === 201, `Upload file returns 201`);
  const fileId = fileData.file.id;
  assert(!!fileId, 'File has ID');
  assert(fileData.file.filename === 'example.js', 'Filename matches');

  // ─── Post Root Comment ───
  console.log('\n─── Post Root Comment on Line 5 ───');

  const { status: c1Status, data: c1Data } = await api('POST', `/api/v1/files/${fileId}/comments`, {
    line: 5,
    body: 'Should we add type annotations here?',
  }, token);
  assert(c1Status === 201, `Root comment returns 201`);
  const rootCommentId = c1Data.comment.id;
  assert(!!rootCommentId, 'Root comment has ID');
  assert(c1Data.comment.line === 5, 'Comment is on line 5');
  assert(c1Data.comment.parentCommentId === null, 'parentCommentId is null (root)');

  // ─── Post Reply ───
  console.log('\n─── Post Reply to Root Comment ───');

  const { status: r1Status, data: r1Data } = await api('POST', `/api/v1/files/${fileId}/comments`, {
    line: 5,
    body: 'Good idea, let me add TypeScript types.',
    parentCommentId: rootCommentId,
  }, token);
  assert(r1Status === 201, `Reply returns 201`);
  const replyId = r1Data.comment.id;
  assert(!!replyId, 'Reply has ID');
  assert(r1Data.comment.parentCommentId === rootCommentId, 'Reply points to parent');

  // ─── Post Another Reply ───
  console.log('\n─── Post Second Reply ───');

  const { status: r2Status, data: r2Data } = await api('POST', `/api/v1/files/${fileId}/comments`, {
    line: 5,
    body: 'Also consider JSDoc comments.',
    parentCommentId: rootCommentId,
  }, token);
  assert(r2Status === 201, `Second reply returns 201`);
  assert(r2Data.comment.parentCommentId === rootCommentId, 'Second reply points to parent');

  // ─── Verify Reply Validation ───
  console.log('\n─── Reply Validation ───');

  const { status: badReplyStatus } = await api('POST', `/api/v1/files/${fileId}/comments`, {
    line: 3,
    body: 'Wrong line reply',
    parentCommentId: rootCommentId,
  }, token);
  assert(badReplyStatus === 400, `Reply on wrong line returns 400 (got ${badReplyStatus})`);

  const { status: badParentStatus } = await api('POST', `/api/v1/files/${fileId}/comments`, {
    line: 5,
    body: 'Bad parent',
    parentCommentId: 'nonexistent-id',
  }, token);
  assert(badParentStatus === 404, `Reply with bad parent returns 404 (got ${badParentStatus})`);

  // ─── Verify Thread Structure ───
  console.log('\n─── GET /files/:fileId/comments — Thread Structure ───');

  const { status: listStatus, data: listData } = await api('GET', `/api/v1/files/${fileId}/comments`, undefined, token);
  assert(listStatus === 200, `GET comments returns 200`);
  assert(Array.isArray(listData.comments), 'Response has comments array');
  assert(listData.comments.length === 1, `1 root comment (got ${listData.comments.length})`);

  const thread = listData.comments[0];
  assert(thread.id === rootCommentId, 'Root comment ID matches');
  assert(thread.body === 'Should we add type annotations here?', 'Root body matches');
  assert(thread.resolved === false, 'Not yet resolved');
  assert(Array.isArray(thread.replies), 'Has replies array');
  assert(thread.replies.length === 2, `2 replies (got ${thread.replies.length})`);
  assert(thread.replies[0].body === 'Good idea, let me add TypeScript types.', 'First reply body matches');
  assert(thread.replies[1].body === 'Also consider JSDoc comments.', 'Second reply body matches');

  // ─── Resolve Root Comment ───
  console.log('\n─── PATCH /comments/:id/resolve ───');

  const { status: resolveStatus, data: resolveData } = await api('PATCH', `/api/v1/comments/${rootCommentId}/resolve`, {}, token);
  assert(resolveStatus === 200, `Resolve returns 200`);
  assert(resolveData.comment.resolved === true, 'Comment is now resolved');
  assert(!!resolveData.comment.resolvedAt, 'Has resolvedAt timestamp');
  assert(resolveData.comment.resolvedBy.id === regData.user.id, 'Resolved by correct user');
  assert(resolveData.comment.replies.length === 2, 'Replies still present after resolve');

  // ─── Verify Resolve in GET ───
  console.log('\n─── Verify Resolved in GET Response ───');

  const { data: afterResolve } = await api('GET', `/api/v1/files/${fileId}/comments`, undefined, token);
  assert(afterResolve.comments[0].resolved === true, 'Confirmed resolved in GET');
  assert(!!afterResolve.comments[0].resolvedBy, 'resolvedBy populated in GET');

  // ─── Toggle Unresolve ───
  console.log('\n─── Toggle Unresolve ───');

  const { status: unresolveStatus, data: unresolveData } = await api('PATCH', `/api/v1/comments/${rootCommentId}/resolve`, {}, token);
  assert(unresolveStatus === 200, `Unresolve returns 200`);
  assert(unresolveData.comment.resolved === false, 'Comment is now unresolved');
  assert(unresolveData.comment.resolvedAt === null, 'resolvedAt is null');
  assert(unresolveData.comment.resolvedById === null, 'resolvedById is null');

  // ─── Cannot Resolve a Reply ───
  console.log('\n─── Cannot Resolve a Reply ───');

  const { status: resolveReplyStatus } = await api('PATCH', `/api/v1/comments/${replyId}/resolve`, {}, token);
  assert(resolveReplyStatus === 400, `Resolving a reply returns 400 (got ${resolveReplyStatus})`);

  // ─── File in GET /files/:fileId also has threads ───
  console.log('\n─── GET /files/:fileId — File includes threaded comments ───');

  const { data: fileGetData } = await api('GET', `/api/v1/files/${fileId}`, undefined, token);
  assert(fileGetData.file.comments.length === 1, 'File has 1 root comment');
  assert(fileGetData.file.comments[0].replies.length === 2, 'Root comment has 2 replies');
  assert(fileGetData.file.comments[0].body === 'Should we add type annotations here?', 'Correct thread body');

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
