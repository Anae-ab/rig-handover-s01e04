// Plan morning-digest § 1. The contract every part of § 2 builds on: commit this first.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl, once parsed. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  /** null when the log says so; views render it as `—`. */
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Error of the last run, null when it had none. */
  lastError: string | null;
  /** Times as written in the log, offset kept (styleguide: never convert to UTC). */
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = Record<RunStatus, number>;

export type NightDigest = {
  night: string;
  /** Sorted by job. The page and the JSON both use this order, never one of their own (ADR 0001). */
  rows: DigestRow[];
  /** Lines that did not parse as a run line: counted, never thrown. */
  badLines: number;
  /** Run lines per status, over the whole night. */
  counts: StatusCounts;
};

/**
 * Reads runs/<night>.jsonl. Returns null when the night has no file (routes answer 404);
 * an empty file gives zero rows.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
