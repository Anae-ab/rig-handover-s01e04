import type { NightDigest } from './types.js';

// Plan morning-digest § 1. Stub so § 2 can import it now; the reader lands with issue #2.
export function readNight(runsDir: string, night: string): NightDigest | null {
  throw new Error(`readNight(${runsDir}, ${night}): not implemented yet (issue #2)`);
}
