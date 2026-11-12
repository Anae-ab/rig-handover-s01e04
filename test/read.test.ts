import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job and 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest?.night).toBe('2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts run lines per status over the night', () => {
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('builds the fixtures/refresh row', () => {
    expect(digest?.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a row whose owner is null', () => {
    const row = digest?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    expect(row?.runs).toBe(1);
  });

  it('keeps the last error of a failed job', () => {
    const row = digest?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-read-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (night: string, content: string) => writeFileSync(join(dir, `${night}.jsonl`), content);

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('gives zero rows for an empty file', () => {
    write('2026-01-01', '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('does not count blank lines as bad lines', () => {
    write('2026-01-01', '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":"x"}\n\n  \n');
    const digest = readNight(dir, '2026-01-01');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(1);
  });

  it('counts invalid JSON and invalid run lines as bad lines', () => {
    write(
      '2026-01-01',
      [
        'not json',
        '[]',
        'null',
        '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"done","owner":"x"}',
        '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok"}',
        '{"at":"not a date","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":"x","error":42}',
        '{"at":"2026-01-01T23:00:00+01:00","job":"","status":"ok","owner":"x"}',
        '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      ].join('\n'),
    );
    const digest = readNight(dir, '2026-01-01');
    expect(digest?.badLines).toBe(8);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('takes last status from the latest time, compared across offsets, and keeps the offset', () => {
    write(
      '2026-01-01',
      [
        // 23:30+00:00 is 00:30+01:00 next day: later than the line below.
        '{"at":"2026-01-01T23:30:00+00:00","job":"a","status":"fail","owner":"x","error":"boom"}',
        '{"at":"2026-01-02T00:10:00+01:00","job":"a","status":"ok","owner":"y"}',
        '{"at":"2026-01-01T22:00:00+01:00","job":"a","status":"retry","owner":"z","error":"slow"}',
      ].join('\n'),
    );
    const row = readNight(dir, '2026-01-01')?.rows[0];
    expect(row).toEqual({
      job: 'a',
      owner: 'z',
      runs: 3,
      retries: 1,
      lastStatus: 'fail',
      lastError: 'boom',
      firstAt: '2026-01-01T22:00:00+01:00',
      lastAt: '2026-01-01T23:30:00+00:00',
    });
  });
});
