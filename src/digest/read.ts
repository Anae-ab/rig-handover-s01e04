import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunLine, RunStatus, StatusCounts } from './types.js';

// Plan morning-digest § 1.

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Parses one log line into a RunLine, or null when it is not a valid run line. */
export function parseRunLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return error === undefined ? { at, job, status, owner } : { at, job, status, owner, error };
}

type Acc = {
  row: DigestRow;
  firstTime: number;
  lastTime: number;
};

export function readNight(runsDir: string, night: string): NightDigest | null {
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const jobs = new Map<string, Acc>();
  let badLines = 0;

  for (const text of readFileSync(path, 'utf8').split('\n')) {
    if (text.trim() === '') continue;
    const line = parseRunLine(text);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const time = Date.parse(line.at);
    const lastError = line.error ?? null;
    const acc = jobs.get(line.job);
    if (acc === undefined) {
      jobs.set(line.job, {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          lastError,
          firstAt: line.at,
          lastAt: line.at,
        },
        firstTime: time,
        lastTime: time,
      });
      continue;
    }
    const { row } = acc;
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (time < acc.firstTime) {
      acc.firstTime = time;
      row.firstAt = line.at;
    }
    // Ties go to the later line in the file.
    if (time >= acc.lastTime) {
      acc.lastTime = time;
      row.lastAt = line.at;
      row.lastStatus = line.status;
      row.lastError = lastError;
    }
  }

  const rows = [...jobs.values()]
    .map((acc) => acc.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}
