import { describe, expect, it, vi } from 'vitest';
import type { NightDigest } from '../src/digest/types.js';

vi.mock('../src/digest/read.js', () => ({
  readNight: (_dir: string, night: string): NightDigest | null =>
    night === '2026-10-28'
      ? { night, rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 } }
      : null,
}));

const { createApp } = await import('../src/app.js');
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns the digest as-is', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-28', rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('404s on missing night and bad format', async () => {
    for (const n of ['2026-01-01', 'nope']) {
      const res = await createApp(config).request(`/api/digest/${n}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no run log', night: n });
    }
  });
});
