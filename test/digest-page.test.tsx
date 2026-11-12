import { describe, expect, it, vi } from 'vitest';
import { readNight } from '../src/digest/read.js';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

vi.mock('../src/digest/read.js', () => ({ readNight: vi.fn() }));

const digest: NightDigest = {
  night: '2026-10-28',
  rows: [
    { job: 'a', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T02:00:00+01:00' },
    { job: 'b', owner: 'x', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: 't1', lastAt: 't2' },
  ],
  badLines: 2,
  counts: { ok: 2, retry: 3, fail: 0 },
};

describe('GET /digest/:night', () => {
  it('renders rows, dashes, warn and bad lines', async () => {
    vi.mocked(readNight).mockReturnValue(digest);
    const res = await createApp().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<tr class="warn"><td>a</td><td>—</td>');
    expect(html).toContain('2 line(s) did not parse');
    expect(html).toContain('2026-10-28T01:00:00+01:00');
    expect(html.indexOf('<td>a</td>')).toBeLessThan(html.indexOf('<td>b</td>'));
  });
  it('404 on bad night and missing file', async () => {
    vi.mocked(readNight).mockReturnValue(null);
    expect((await createApp().request('/digest/nope')).status).toBe(404);
    const res = await createApp().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-01-01');
  });
  it('empty night', async () => {
    vi.mocked(readNight).mockReturnValue({ ...digest, rows: [], badLines: 0 });
    expect(await (await createApp().request('/digest/2026-10-28')).text()).toContain('nothing ran');
  });
});
