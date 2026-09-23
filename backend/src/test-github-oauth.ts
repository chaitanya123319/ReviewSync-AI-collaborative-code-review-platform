/**
 * Integration test for GitHub OAuth backend endpoints.
 *
 * Tests the endpoint structure, error handling, and account linking.
 * Cannot test actual GitHub code exchange without real credentials,
 * so we verify error paths and the client-id config endpoint.
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
  console.log('\n🔐 GitHub OAuth — Integration Tests\n');

  // ─── POST /auth/github — missing code ───
  console.log('─── Error handling ───');
  const { status: noCode } = await api('POST', '/api/v1/auth/github', {});
  assert(noCode === 400, `Missing code returns 400 (got ${noCode})`);

  const { status: nullCode } = await api('POST', '/api/v1/auth/github', { code: '' });
  assert(nullCode === 400, `Empty code returns 400 (got ${nullCode})`);

  // ─── POST /auth/github — invalid code ───
  console.log('\n─── Invalid code (if GITHUB_CLIENT_ID set) ───');
  const { status: badCode, data: badData } = await api('POST', '/api/v1/auth/github', { code: 'invalid_code_abc' });
  // If GitHub OAuth is configured, it will try to exchange and fail with 401 or 500
  // If not configured, it returns 500 with "not configured" message
  const isConfigured = badCode !== 500 || !badData.error?.includes('not configured');
  if (isConfigured) {
    assert(badCode === 401, `Invalid code returns 401 (got ${badCode})`);
    console.log(`  ℹ️  Message: ${badData.error}`);
  } else {
    console.log(`  ⚠️  GitHub OAuth not configured (GITHUB_CLIENT_ID not set)`);
    assert(badCode === 500, `Not configured returns 500 (got ${badCode})`);
    assert(badData.error.includes('not configured'), 'Error mentions not configured');
  }

  // ─── GET /auth/github/client-id ───
  console.log('\n─── GET /auth/github/client-id ───');
  const { status: cidStatus, data: cidData } = await api('GET', '/api/v1/auth/github/client-id');
  if (isConfigured) {
    assert(cidStatus === 200, `Client ID endpoint returns 200 (got ${cidStatus})`);
    assert(typeof cidData.clientId === 'string' && cidData.clientId.length > 0, 'Returns non-empty clientId');
    console.log(`  ℹ️  Client ID: ${cidData.clientId.slice(0, 6)}...`);
  } else {
    assert(cidStatus === 404, `Not configured returns 404 (got ${cidStatus})`);
  }

  // ─── Existing email/password auth still works ───
  console.log('\n─── Legacy auth still works ───');

  const { status: regStatus, data: regData } = await api('POST', '/api/v1/auth/register', {
    name: `GitHubTest-${TEST_ID}`,
    email: `ghtest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  assert(regStatus === 201, 'Register still works (201)');
  assert(!!regData.accessToken, 'Returns access token');

  const { status: loginStatus, data: loginData } = await api('POST', '/api/v1/auth/login', {
    email: `ghtest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  assert(loginStatus === 200, 'Login still works (200)');
  assert(!!loginData.accessToken, 'Returns access token');

  // ─── Verify /me returns new fields ───
  console.log('\n─── /me endpoint includes GitHub fields ───');
  const { data: meData } = await api('GET', '/api/v1/auth/me', undefined, loginData.accessToken);
  assert(meData.user.githubId === null || meData.user.githubId === undefined, 'githubId is null for email user');
  assert('avatarUrl' in meData.user, 'avatarUrl field exists');

  // ─── Schema: githubId and password changes ───
  console.log('\n─── Schema validation ───');
  // Duplicate email should still fail
  const { status: dupStatus } = await api('POST', '/api/v1/auth/register', {
    name: 'Dup',
    email: `ghtest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  assert(dupStatus === 409, `Duplicate email still returns 409 (got ${dupStatus})`);

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
