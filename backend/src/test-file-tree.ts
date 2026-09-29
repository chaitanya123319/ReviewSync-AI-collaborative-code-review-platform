/**
 * Integration test for multi-file folder tree support.
 *
 * Tests:
 * - Seed creates multiple files with paths
 * - File list returns path field, sorted by path+filename
 * - Individual file GET returns path
 * - File upload with custom path works
 * - Switching between files works
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
  console.log('\n📁 Multi-File Folder Tree — Integration Tests\n');

  // ─── Setup ───
  console.log('─── Setup ───');

  const { data: regData } = await api('POST', '/api/v1/auth/register', {
    name: `TreeTest-${TEST_ID}`,
    email: `treetest-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const token = regData.accessToken;
  console.log('  ✅ Registered');

  const { data: sessData } = await api('POST', '/api/v1/sessions',
    { name: `Tree Test ${TEST_ID}`, projectName: 'treetest' }, token);
  const sessionId = sessData.session.id;
  console.log(`  ✅ Session created: ${sessionId.slice(0, 8)}...`);

  // ─── Seed files ───
  console.log('\n─── POST /sessions/:id/files/seed ───');

  const { status: seedStatus, data: seedData } = await api(
    'POST', `/api/v1/sessions/${sessionId}/files/seed`, {}, token);

  assert(seedStatus === 201, `Seed returns 201 (got ${seedStatus})`);
  assert(Array.isArray(seedData.files), 'Returns files array');
  assert(seedData.files.length === 5, `Creates 5 files (got ${seedData.files.length})`);

  // Check that files have paths
  const fileWithPath = seedData.files.find((f: any) => f.path === 'src/routes');
  assert(!!fileWithPath, 'At least one file has path src/routes');
  const rootFile = seedData.files.find((f: any) => f.path === '');
  assert(!!rootFile, 'At least one file has empty path (root)');

  // ─── List files ───
  console.log('\n─── GET /sessions/:id/files ───');

  const { status: listStatus, data: listData } = await api(
    'GET', `/api/v1/sessions/${sessionId}/files`, undefined, token);

  assert(listStatus === 200, `List returns 200 (got ${listStatus})`);
  assert(listData.files.length === 5, `Lists 5 files (got ${listData.files.length})`);

  // Check all files have path field
  const allHavePath = listData.files.every((f: any) => typeof f.path === 'string');
  assert(allHavePath, 'All files have path field');

  // Check sorted: root files first (empty path), then src, then src/routes, then src/utils
  const paths = listData.files.map((f: any) => f.path);
  assert(paths[0] === '', `First file is root (got "${paths[0]}")`);

  // ─── Upload file with custom path ───
  console.log('\n─── POST file with custom path ───');

  const { status: uploadStatus, data: uploadData } = await api(
    'POST', `/api/v1/sessions/${sessionId}/files`, {
      filename: 'config.json',
      path: 'src/config',
      language: 'json',
      content: '{ "port": 3000 }',
    }, token);

  assert(uploadStatus === 201, `Upload returns 201 (got ${uploadStatus})`);
  assert(uploadData.file.path === 'src/config', `Path stored as src/config (got "${uploadData.file.path}")`);
  assert(uploadData.file.filename === 'config.json', 'Filename correct');

  // ─── Get individual file ───
  console.log('\n─── GET /files/:fileId ───');

  const fileId = fileWithPath.id;
  const { status: getStatus, data: getData } = await api(
    'GET', `/api/v1/files/${fileId}`, undefined, token);

  assert(getStatus === 200, `GET file returns 200 (got ${getStatus})`);
  assert(getData.file.path === 'src/routes', `File path is src/routes (got "${getData.file.path}")`);
  assert(getData.file.filename === 'users.js', `Filename is users.js (got "${getData.file.filename}")`);
  assert(typeof getData.file.content === 'string' && getData.file.content.length > 0, 'Content is non-empty');

  // ─── Verify we can switch between files ───
  console.log('\n─── File switching ───');

  const otherFile = seedData.files.find((f: any) => f.path === 'src/utils' && f.filename === 'db.js');
  const { status: switchStatus, data: switchData } = await api(
    'GET', `/api/v1/files/${otherFile.id}`, undefined, token);

  assert(switchStatus === 200, `Switch to db.js returns 200 (got ${switchStatus})`);
  assert(switchData.file.filename === 'db.js', 'Switched to db.js');
  assert(switchData.file.path === 'src/utils', 'Path is src/utils');

  // ─── List now has 6 files ───
  console.log('\n─── Updated file count ───');

  const { data: updatedList } = await api(
    'GET', `/api/v1/sessions/${sessionId}/files`, undefined, token);
  assert(updatedList.files.length === 6, `Total files = 6 (got ${updatedList.files.length})`);

  // ─── Summary ───
  console.log(`\n${'═'.repeat(44)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(44)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
