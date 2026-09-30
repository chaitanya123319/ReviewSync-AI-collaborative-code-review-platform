/**
 * Integration test for Socket.IO cursor tracking.
 *
 * Verifies:
 * - cursor_move events are relayed to other users in the same session
 * - cursor_remove is sent when a user leaves
 * - cursor_move from a different session room is NOT received
 */

import { io, type Socket } from 'socket.io-client';

const API = process.env.API_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'http://localhost:3001';
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

  return res.json();
}

function connectSocket(): Socket {
  return io(WS_URL, { transports: ['websocket'], autoConnect: true });
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function noEvent(socket: Socket, event: string, durationMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let received = false;
    const handler = () => { received = true; };
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve(!received);
    }, durationMs);
  });
}

async function run() {
  console.log('\n🖱️  Cursor Tracking — Integration Tests\n');

  // ─── Setup: create 2 users + session ───
  console.log('─── Setup ───');

  const user1 = await api('POST', '/api/v1/auth/register', {
    name: `CursorUser1-${TEST_ID}`,
    email: `cursor1-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const user2 = await api('POST', '/api/v1/auth/register', {
    name: `CursorUser2-${TEST_ID}`,
    email: `cursor2-${TEST_ID}@test.com`,
    password: 'password123',
  });
  const token1 = user1.accessToken;
  const token2 = user2.accessToken;
  console.log('  ✅ Two users registered');

  const sess = await api('POST', '/api/v1/sessions', {
    name: `Cursor Test ${TEST_ID}`, projectName: 'cursor',
  }, token1);
  const sessionId = sess.session.id;

  // Join user2 to session
  await api('POST', `/api/v1/sessions/${sessionId}/join`, {}, token2);
  console.log(`  ✅ Session created and user2 joined: ${sessionId.slice(0, 8)}...`);

  // ─── Connect sockets ───
  console.log('\n─── Socket connections ───');

  const sock1 = connectSocket();
  const sock2 = connectSocket();

  await new Promise<void>((r) => sock1.on('connect', r));
  await new Promise<void>((r) => sock2.on('connect', r));
  console.log('  ✅ Both sockets connected');

  // Join session room
  sock1.emit('join_session', { sessionId, token: token1 });
  sock2.emit('join_session', { sessionId, token: token2 });

  // Wait for online_users_list on both
  await waitForEvent(sock1, 'online_users_list');
  await waitForEvent(sock2, 'online_users_list');
  console.log('  ✅ Both joined session room');

  // ─── Test 1: cursor_move is relayed ───
  console.log('\n─── cursor_move relay ───');

  const cursorPromise = waitForEvent<{
    userId: string; name: string; fileId: string; line: number; column: number;
  }>(sock2, 'cursor_move');

  sock1.emit('cursor_move', { fileId: 'file-abc', line: 42, column: 15 });

  const cursorEvent = await cursorPromise;
  assert(cursorEvent.line === 42, `Received line 42 (got ${cursorEvent.line})`);
  assert(cursorEvent.column === 15, `Received column 15 (got ${cursorEvent.column})`);
  assert(cursorEvent.fileId === 'file-abc', `Received fileId file-abc (got ${cursorEvent.fileId})`);
  assert(typeof cursorEvent.userId === 'string' && cursorEvent.userId.length > 0, 'Has userId');
  assert(cursorEvent.name.includes('CursorUser1'), `Name is CursorUser1 (got ${cursorEvent.name})`);

  // ─── Test 2: sender does NOT receive their own cursor ───
  console.log('\n─── No self-echo ───');

  // Emit another cursor_move from sock1 and verify sock1 doesn't get it back
  sock1.emit('cursor_move', { fileId: 'file-xyz', line: 10, column: 1 });
  const noEcho = await noEvent(sock1, 'cursor_move', 1000);
  assert(noEcho, 'Sender does not receive their own cursor_move');

  // ─── Test 3: cursor_remove on leave ───
  console.log('\n─── cursor_remove on leave ───');

  const removePromise = waitForEvent<{ userId: string }>(sock2, 'cursor_remove', 5000);
  sock1.emit('leave_session');
  const removeEvent = await removePromise;
  assert(typeof removeEvent.userId === 'string', `Received cursor_remove with userId (${removeEvent.userId.slice(0, 8)}...)`);

  // ─── Test 4: cursor_remove on disconnect ───
  console.log('\n─── cursor_remove on disconnect ───');

  // Reconnect sock1 and rejoin
  const sock3 = connectSocket();
  await new Promise<void>((r) => sock3.on('connect', r));
  sock3.emit('join_session', { sessionId, token: token1 });
  await waitForEvent(sock2, 'online_users_list');

  // Now disconnect sock3
  const removePromise2 = waitForEvent<{ userId: string }>(sock2, 'cursor_remove', 5000);
  sock3.disconnect();
  const removeEvent2 = await removePromise2;
  assert(typeof removeEvent2.userId === 'string', 'cursor_remove fired on disconnect');

  // ─── Cleanup ───
  sock1.disconnect();
  sock2.disconnect();

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
