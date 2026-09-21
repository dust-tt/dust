// Awake time for the warm function worker.
//
// The sandbox is paused and resumed as a whole. On resume the monotonic clock
// behind `setTimeout` and `performance.now()` can jump forward by the entire
// pause, so a deadline armed across that jump fires immediately. Sampling on
// a short tick and dropping one gap larger than the gap limit counts time the
// process actually ran: real time arrives as small gaps, a pause arrives as
// one huge gap.

/** How often the clock samples. Short enough that a 2s queue wait stays accurate. */
export const AWAKE_TICK_MS = 250;

/**
 * Above normal tick lateness (a busy event loop can delay a timer by a second
 * or two) and far below a sandbox pause. A larger gap is a clock step, not
 * time the process spent running.
 */
export const AWAKE_GAP_LIMIT_MS = 5_000;

interface Cancel {
  clear(): void;
}

interface Timer {
  dueAt: number;
  fn: () => void;
  cleared: boolean;
}

export interface AwakeClockOptions {
  readMono?: () => number;
  schedule?: (cb: () => void, delayMs: number) => Cancel;
  tickMs?: number;
  gapLimitMs?: number;
}

function defaultSchedule(cb: () => void, delayMs: number): Cancel {
  const timer = setTimeout(cb, delayMs);
  return { clear: () => clearTimeout(timer) };
}

/**
 * @cc [owner:spolu,label:product;performance] awake-time-ignores-clock-jumps
 * `now()` MUST add a forward monotonic gap only when it is less than or equal to the gap limit
 * this clock was constructed with (default `AWAKE_GAP_LIMIT_MS`), and MUST add that gap in full.
 * A larger forward gap MUST NOT change `now()`. `now()` MUST NOT move backward. `delay()` MUST
 * invoke its callback once counted awake time reaches the delay, including when an ignored gap
 * falls in the middle, and MUST NOT invoke it because of an ignored gap.
 */
export class AwakeClock {
  private awakeMs = 0;
  private lastMono: number;
  private timers: Timer[] = [];
  private ticker: Cancel | null = null;
  private stopped = false;
  private readonly readMono: () => number;
  private readonly schedule: (cb: () => void, delayMs: number) => Cancel;
  private readonly tickMs: number;
  private readonly gapLimitMs: number;

  constructor(options: AwakeClockOptions = {}) {
    this.readMono = options.readMono ?? (() => performance.now());
    this.schedule = options.schedule ?? defaultSchedule;
    this.tickMs = options.tickMs ?? AWAKE_TICK_MS;
    this.gapLimitMs = options.gapLimitMs ?? AWAKE_GAP_LIMIT_MS;
    this.lastMono = this.readMono();
    this.arm();
  }

  /** Awake milliseconds since construction. */
  now(): number {
    this.sample();
    return this.awakeMs;
  }

  /**
   * Run `fn` after `delayMs` of awake time. The returned function cancels it.
   * A monotonic jump larger than the gap limit does not count, so a sandbox
   * resume cannot expire the delay.
   */
  delay(delayMs: number, fn: () => void): () => void {
    const timer: Timer = {
      dueAt: this.now() + delayMs,
      fn,
      cleared: false,
    };
    this.timers.push(timer);
    return () => {
      timer.cleared = true;
    };
  }

  stop(): void {
    this.stopped = true;
    this.ticker?.clear();
    this.ticker = null;
  }

  private sample(): void {
    const mono = this.readMono();
    const delta = mono - this.lastMono;
    this.lastMono = mono;
    if (delta > 0 && delta <= this.gapLimitMs) {
      this.awakeMs += delta;
    }
  }

  private fireDue(): void {
    const now = this.awakeMs;
    const due: Array<() => void> = [];
    const kept: Timer[] = [];
    for (const timer of this.timers) {
      if (timer.cleared) {
        continue;
      }
      if (timer.dueAt <= now) {
        due.push(timer.fn);
      } else {
        kept.push(timer);
      }
    }
    // Swap before running callbacks so a callback that arms a new delay
    // appends to the live list instead of a discarded snapshot.
    this.timers = kept;
    for (const fn of due) {
      fn();
    }
  }

  private arm(): void {
    this.ticker = this.schedule(() => {
      this.ticker = null;
      try {
        this.sample();
        this.fireDue();
      } finally {
        if (!this.stopped) {
          this.arm();
        }
      }
    }, this.tickMs);
  }
}
