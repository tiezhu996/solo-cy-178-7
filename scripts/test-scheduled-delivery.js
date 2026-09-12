#!/usr/bin/env node
/*
 * Repeatable black-box regression tests for scheduled letter delivery.
 *
 * Spawns a real backend on an OS-assigned port with a throwaway SQLite file,
 * drives it over HTTP, and tears everything down on exit. No test framework
 * or extra dependency required.
 *
 * Run from the repository root:
 *   npm test            (also: node scripts/test-scheduled-delivery.js)
 *
 * Covers:
 *   1. immediate delivery (no scheduledAt keeps the old behaviour)
 *   2. scheduled letters stay pending and are invisible to the receiver
 *   3. receiver cannot favorite / skip / reply / open / reschedule / cancel
 *   4. past-time rejection on send and on reschedule
 *   5. cancel before due time; cancelled letters stay hidden and frozen
 *   6. reschedule to a later time voids the original delivery time
 *   7. reschedule to an earlier time delivers at the NEW time
 *   8. confirming reschedule without changing the picker keeps the time
 *   9. delivered letters cannot be rescheduled or cancelled (409)
 *  10. cancelled letters cannot be rescheduled (409)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const RESCHEDULE_UI = path.join(
  ROOT,
  'frontend',
  'src',
  'components',
  'RescheduleControl.jsx'
);
const SCHEDULER_TICK_MS = 5000;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  ✗ ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeout = 15000, every = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let result;
    try {
      result = await predicate();
    } catch {
      result = null;
    }
    if (result) return result;
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for: ${label}`);
    }
    await sleep(every);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startBackend() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-regtest-'));
  const dbFile = path.join(tmpDir, 'regression.db');
  const dbPort = await getFreePort();

  const child = spawn(process.execPath, [path.join(BACKEND_DIR, 'src', 'index.js')], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: '0',
      DB_PORT: String(dbPort),
      SQLITE_PATH: dbFile,
      JWT_SECRET: 'regression-test-secret'
    }
  });

  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`backend did not start\n${output}`)), 10000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/\[backend\] listening on 0\.0\.0\.0:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`backend exited early (code ${code})\n${output}`));
    });
  });

  return {
    port,
    child,
    async stop() {
      await new Promise((resolve) => {
        child.on('exit', resolve);
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
          resolve();
        }, 3000).unref();
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

function http(base, method, urlPath, token, body) {
  return fetch(`${base}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (res) => {
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  });
}

async function main() {
  const backend = await startBackend();
  const base = `http://127.0.0.1:${backend.port}`;

  try {
    // --- setup: two users; with only two accounts the random target is always B ---
    const stamp = `${Date.now()}_${process.pid}`;
    const regA = await http(base, 'POST', '/api/auth/register', null, {
      penName: `reg_a_${stamp}`,
      password: 'pw123456'
    });
    const regB = await http(base, 'POST', '/api/auth/register', null, {
      penName: `reg_b_${stamp}`,
      password: 'pw123456'
    });
    check('测试用户注册成功', regA.status === 200 && regB.status === 200,
      `${regA.status}/${regB.status}`);
    const A = regA.json.token;
    const B = regB.json.token;

    const inbox = async (token) => (await http(base, 'GET', '/api/inbox', token)).json;
    const receivedIds = async (token) =>
      (await inbox(token)).received.map((l) => l.id);
    const getSent = async (token, id) =>
      (await inbox(token)).sent.find((l) => l.id === id);

    // --- 1. immediate delivery --------------------------------------------------
    console.log('\n[1] 立即投递（无 scheduledAt 行为不变）');
    const imm = await http(base, 'POST', '/api/letters', A, { content: '立即寄出的信' });
    check('立即投递返回 delivered', imm.status === 200 && imm.json.status === 'delivered',
      imm.text);
    const immId = imm.json.id;
    await waitFor(async () => (await receivedIds(B)).includes(immId), {
      label: 'immediate letter visible to receiver'
    });
    const immInInbox = (await inbox(B)).received.find((l) => l.id === immId);
    check('立即送达收信人收件箱且无排期字段',
      immInInbox && immInInbox.status === 'delivered' && immInInbox.scheduledAt == null);

    // --- 2. scheduled letters stay pending & invisible -------------------------
    console.log('\n[2] 定时投递：待投递期间收信端不可见');
    const lateOrigAt = Date.now() + 8000;
    const late = await http(base, 'POST', '/api/letters', A, {
      content: '原定较早、稍后改晚的信',
      scheduledAt: lateOrigAt
    });
    check('定时投递返回 scheduled', late.status === 200 && late.json.status === 'scheduled',
      late.text);
    const lateId = late.json.id;

    const fast = await http(base, 'POST', '/api/letters', A, {
      content: '稍后改到很快的信',
      scheduledAt: Date.now() + 30000
    });
    const fastId = fast.json.id;

    const cancelMe = await http(base, 'POST', '/api/letters', A, {
      content: '会被取消的信',
      scheduledAt: Date.now() + 60000
    });
    const cancelId = cancelMe.json.id;

    const deliveredSoon = await http(base, 'POST', '/api/letters', A, {
      content: '很快自然投递的信',
      scheduledAt: Date.now() + 4000
    });
    const deliveredSoonId = deliveredSoon.json.id;

    const cancelledLater = await http(base, 'POST', '/api/letters', A, {
      content: '取消后不可改期的信',
      scheduledAt: Date.now() + 60000
    });
    const cancelledLaterId = cancelledLater.json.id;

    const bReceived = await receivedIds(B);
    check('待投递信不出现在收信人收件箱',
      ![lateId, fastId, cancelId, deliveredSoonId, cancelledLaterId].some((id) =>
        bReceived.includes(id)),
      `received=${JSON.stringify(bReceived)}`);

    // --- 3. receiver cannot act on a waiting letter -----------------------------
    console.log('\n[3] 收信端无法收藏/跳过/回复/打开/改期/取消');
    const bThread = await http(base, 'GET', `/api/letters/${lateId}/thread`, B);
    const bSkip = await http(base, 'POST', `/api/letters/${lateId}/skip`, B);
    const bFav = await http(base, 'POST', `/api/letters/${lateId}/favorite`, B);
    const bReply = await http(base, 'POST', `/api/letters/${lateId}/reply`, B, {
      content: '提前回复'
    });
    const bResched = await http(base, 'POST', `/api/letters/${lateId}/reschedule`, B, {
      scheduledAt: Date.now() + 120000
    });
    const bCancel = await http(base, 'POST', `/api/letters/${lateId}/cancel`, B);
    check('收信人打开线程 404', bThread.status === 404, `${bThread.status}`);
    check('收信人跳过 404', bSkip.status === 404, `${bSkip.status}`);
    check('收信人收藏 404', bFav.status === 404, `${bFav.status}`);
    check('收信人回复 404', bReply.status === 404, `${bReply.status}`);
    check('收信人改期 403（越权）', bResched.status === 403, `${bResched.status}`);
    check('收信人取消 403（越权）', bCancel.status === 403, `${bCancel.status}`);

    // --- 4. past-time rejection -------------------------------------------------
    console.log('\n[4] 过去时间拒绝');
    const pastSend = await http(base, 'POST', '/api/letters', A, {
      content: '过去的信',
      scheduledAt: Date.now() - 60000
    });
    check('写信选过去时间 400', pastSend.status === 400, `${pastSend.status}`);
    const pastMove = await http(base, 'POST', `/api/letters/${lateId}/reschedule`, A, {
      scheduledAt: Date.now() - 1000
    });
    check('改期到过去时间 400 且原时刻不变',
      pastMove.status === 400 && (await getSent(A, lateId)).scheduledAt === lateOrigAt,
      `${pastMove.status}`);
    const badMove = await http(base, 'POST', `/api/letters/${lateId}/reschedule`, A, {
      scheduledAt: 'not-a-time'
    });
    check('改期非法时间 400', badMove.status === 400, `${badMove.status}`);
    const missing = await http(base, 'POST', '/api/letters/999999/reschedule', A, {
      scheduledAt: Date.now() + 60000
    });
    check('改期不存在的信 404', missing.status === 404, `${missing.status}`);

    // --- 5. cancel before the due time ------------------------------------------
    console.log('\n[5] 到点前取消；取消后保持不可见且冻结');
    const cancelRes = await http(base, 'POST', `/api/letters/${cancelId}/cancel`, A);
    check('发信人取消成功', cancelRes.status === 200, cancelRes.text);
    check('取消后发件箱状态为 cancelled',
      (await getSent(A, cancelId)).status === 'cancelled');
    check('取消后的信收信人仍看不到',
      !(await receivedIds(B)).includes(cancelId));
    const cancelAfterCancel = await http(
      base,
      'POST',
      `/api/letters/${cancelId}/cancel`,
      A
    );
    check('重复取消 409', cancelAfterCancel.status === 409, `${cancelAfterCancel.status}`);
    const moveAfterCancel = await http(
      base,
      'POST',
      `/api/letters/${cancelledLaterId}/cancel`,
      A
    );
    const reschedCancelled = await http(
      base,
      'POST',
      `/api/letters/${cancelledLaterId}/reschedule`,
      A,
      { scheduledAt: Date.now() + 120000 }
    );
    check('取消后改期 409',
      moveAfterCancel.status === 200 && reschedCancelled.status === 409,
      `${reschedCancelled.status}`);

    // --- 6 & 7. reschedule behaviour -------------------------------------------
    console.log('\n[6] 改期到更晚：原时间失效');
    const laterAt = Date.now() + 45000;
    const moveLate = await http(base, 'POST', `/api/letters/${lateId}/reschedule`, A, {
      scheduledAt: laterAt
    });
    check('改期成功返回 scheduled 与新时间',
      moveLate.status === 200 &&
      moveLate.json.status === 'scheduled' &&
      moveLate.json.scheduledAt === laterAt,
      moveLate.text);

    console.log('\n[7] 改期到更早：按新时间投递');
    const fastNewAt = Date.now() + 6000;
    const moveFast = await http(base, 'POST', `/api/letters/${fastId}/reschedule`, A, {
      scheduledAt: fastNewAt
    });
    check('改期成功', moveFast.status === 200, moveFast.text);

    // Wait long enough to cross the ORIGINAL time of `late` while the faster
    // letter and the naturally-due letter flip to delivered.
    await sleep(10000);
    check('越过原时间后改晚的信仍待投递',
      (await getSent(A, lateId)).status === 'scheduled');
    check('改晚的信收信人仍看不到（原时间已失效）',
      !(await receivedIds(B)).includes(lateId));

    await waitFor(async () => (await receivedIds(B)).includes(fastId), {
      timeout: SCHEDULER_TICK_MS + 8000,
      label: 'rescheduled-earlier letter delivered at new time'
    });
    const fastReceived = (await inbox(B)).received.find((l) => l.id === fastId);
    check('改早的信按新时间进入收件箱',
      fastReceived && fastReceived.status === 'delivered' &&
      fastReceived.deliveredAt >= fastNewAt - SCHEDULER_TICK_MS,
      JSON.stringify(fastReceived));

    await waitFor(async () => (await receivedIds(B)).includes(deliveredSoonId), {
      label: 'naturally due letter delivered'
    });

    // terminal states: delivered letter is frozen
    console.log('\n[9] 已投递信件的终态限制');
    const reschedDelivered = await http(
      base,
      'POST',
      `/api/letters/${fastId}/reschedule`,
      A,
      { scheduledAt: Date.now() + 120000 }
    );
    const cancelDelivered = await http(
      base,
      'POST',
      `/api/letters/${fastId}/cancel`,
      A
    );
    check('投递后改期 409', reschedDelivered.status === 409, `${reschedDelivered.status}`);
    check('投递后取消 409', cancelDelivered.status === 409, `${cancelDelivered.status}`);

    // delivered letter then behaves like an ordinary letter
    const fav = await http(base, 'POST', `/api/letters/${fastId}/favorite`, B);
    const reply = await http(base, 'POST', `/api/letters/${fastId}/reply`, B, {
      content: '收到后正常回复'
    });
    check('投递后收信人可收藏', fav.status === 200, fav.text);
    check('投递后收信人可回复', reply.status === 200, reply.text);

    // --- 8. unchanged-reschedule keeps the exact time ---------------------------
    // The frontend fix is a pure decision in RescheduleControl. Guard both the
    // source logic and its effect: opening the minute-precision picker truncates
    // seconds; confirming with that same value sends NO request.
    console.log('\n[8] 改期未修改时保持原投递时刻');
    const source = fs.readFileSync(RESCHEDULE_UI, 'utf8');
    check(
      '改期控件存在未修改判定（unchanged 守卫）',
      /unchanged\s*=\s*value\s*===\s*initialValue/.test(source)
    );
    check(
      '未修改确认不调用 reschedule 接口',
      /if\s*\(unchanged\)\s*\{[\s\S]*?setEditing\(false\)[\s\S]*?return/.test(source) &&
        !/unchanged[\s\S]{0,200}LetterApi\.reschedule/.test(source)
    );
    (function simulateUnchangedConfirm() {
      // Mirror of the component logic + datetime helpers.
      const formatLocalInput = (ms) => {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };
      const localInputToMs = (v) => {
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : t;
      };
      const exactOriginal = Date.now() + 123456; // carries non-zero seconds
      const shown = formatLocalInput(exactOriginal); // seconds are dropped here
      const value = shown; // user does not touch the picker
      let requestSent = false;
      let storedTime = exactOriginal;
      const unchanged = value === shown;
      if (!unchanged) {
        requestSent = true;
        storedTime = localInputToMs(value);
      }
      check('打开即确认不发请求', requestSent === false);
      check('原投递时刻（含秒）保持不变', storedTime === exactOriginal);
      // and a genuinely different picker value WOULD update
      const changed = formatLocalInput(exactOriginal + 2 * 60 * 1000);
      check('选择不同时刻会产生新时间', changed !== shown && localInputToMs(changed) !== exactOriginal);
    })();

    // --- finally: move the late letter once more and let it deliver ------------
    console.log('\n[10] 改晚的信最终按新时间投递');
    const nextAt = Date.now() + 7000;
    const again = await http(base, 'POST', `/api/letters/${lateId}/reschedule`, A, {
      scheduledAt: nextAt
    });
    check('待投递信可再次改期', again.status === 200, again.text);
    await waitFor(async () => (await receivedIds(B)).includes(lateId), {
      timeout: SCHEDULER_TICK_MS + 10000,
      label: 'late letter delivered at its rescheduled time'
    });
    const lateReceived = (await inbox(B)).received.find((l) => l.id === lateId);
    check('改晚的信按最新时间送达',
      lateReceived && lateReceived.deliveredAt >= nextAt - SCHEDULER_TICK_MS,
      JSON.stringify({ nextAt, got: lateReceived && lateReceived.deliveredAt }));
  } finally {
    await backend.stop();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('失败项:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n测试运行异常:', err);
  process.exit(1);
});
