import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const GOOD = '2026-10-28';
const EMPTY = '2026-10-30';
const BAD = '2026-10-31';
const MISSING = '2026-11-01';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Written out of order on purpose: the order must come from the sorted reader output.
const goodLines = [
  line('2026-10-28T23:00:02+01:00', 'zeta/cleanup', 'ok', null),
  line('2026-10-28T23:00:03+01:00', 'beta/flaky', 'retry', 'rook'),
  line('2026-10-28T23:01:03+01:00', 'beta/flaky', 'retry', 'rook'),
  line('2026-10-28T23:02:03+01:00', 'beta/flaky', 'retry', 'rook'),
  line('2026-10-28T23:03:03+01:00', 'beta/flaky', 'ok', 'rook'),
  line('2026-10-28T23:00:04+01:00', 'gamma/export', 'fail', 'lane-07', 'disk full'),
  line('2026-10-28T23:00:05+01:00', 'alpha/sync', 'ok', 'rook'),
];
const goodJobs = ['alpha/sync', 'beta/flaky', 'gamma/export', 'zeta/cleanup'];

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.writeFileSync(path.join(dir, `${GOOD}.jsonl`), goodLines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, `${EMPTY}.jsonl`), '');
  const bad = [goodLines[6], '{"at":"2026-10-31T23:00:00+01:00","job":"trunc', goodLines[0]];
  fs.writeFileSync(path.join(dir, `${BAD}.jsonl`), bad.join('\n') + '\n');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders every job, the lane banner, a dash for null owner and a warn row for fail', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of goodJobs) expect(html).toContain(job);
    expect(html).toContain('—');
    // the warn class sits on the fail row, not only somewhere in the stylesheet
    const failRow = html.split('<tr').find((r) => r.includes('gamma/export'));
    expect(failRow).toMatch(/class="[^"]*warn/);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('empty night renders "nothing ran"', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line does not break the page', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
    expect(html).toContain('zeta/cleanup');
  });
});

describe('GET /api/digest/:night', () => {
  it('404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('empty night gives zero rows', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.rows).toEqual([]);
  });

  it('bad line is counted, good jobs stay', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync', 'zeta/cleanup']);
  });

  it('rows are sorted by job', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.rows.map((r) => r.job)).toEqual(goodJobs);
  });

  it('job order matches the page', async () => {
    const json = (await (await app.request(`/api/digest/${GOOD}`)).json()) as NightDigest;
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const jobs = json.rows.map((r) => r.job);
    const inPage = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(html).toContain(jobs[0]);
    expect(inPage).toEqual(jobs);
  });
});
