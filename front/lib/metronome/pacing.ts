// Wraps each Metronome call so a bulk caller can rate-limit. Metronome publishes
// an 11 RPS API limit shared with production traffic on the same key, so bulk
// callers should pace under it.
export type PaceFn = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * @cc [owner:avervaet,label:performance] min-interval-across-concurrent-callers
 * Calls wrapped by the same returned function MUST start at least `1000 / maxRps` ms apart, in
 * call order, including when several callers invoke it concurrently. Separate returned functions
 * do not share pacing.
 */
export function makeMetronomePacer({
  maxRps = 10,
}: { maxRps?: number } = {}): PaceFn {
  const minIntervalMs = 1000 / maxRps;
  let nextSlotAt = 0;

  return async (fn) => {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + minIntervalMs;
    const wait = slot - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    return fn();
  };
}
