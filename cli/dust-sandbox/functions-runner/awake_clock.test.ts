import { describe, expect, test } from "bun:test";

import { AWAKE_GAP_LIMIT_MS, AwakeClock } from "./awake_clock.ts";

function manualClock(gapLimitMs = AWAKE_GAP_LIMIT_MS): {
  clock: AwakeClock;
  setMono: (ms: number) => void;
  tick: () => void;
} {
  let mono = 0;
  let pending: (() => void) | null = null;
  const clock = new AwakeClock({
    readMono: () => mono,
    gapLimitMs,
    schedule(cb) {
      pending = cb;
      return {
        clear() {
          if (pending === cb) {
            pending = null;
          }
        },
      };
    },
  });
  return {
    clock,
    setMono(ms: number) {
      mono = ms;
    },
    tick() {
      const cb = pending;
      if (cb === undefined || cb === null) {
        throw new Error("no tick scheduled");
      }
      cb();
    },
  };
}

describe("AwakeClock", () => {
  test("counts steady forward time and ignores a sandbox-sized jump", () => {
    const { clock, setMono } = manualClock();
    // Real time arrives as gaps no larger than the limit. A minute of runtime
    // is twelve samples, not one 60s jump (that jump would look like a pause).
    const minute = 60_000;
    for (
      let elapsed = AWAKE_GAP_LIMIT_MS;
      elapsed <= minute;
      elapsed += AWAKE_GAP_LIMIT_MS
    ) {
      setMono(elapsed);
      expect(clock.now()).toBe(elapsed);
    }

    // The sandbox was paused for an hour, then woke. That one gap does not count.
    setMono(minute + 60 * 60 * 1_000);
    expect(clock.now()).toBe(minute);

    setMono(minute + 60 * 60 * 1_000 + 500);
    expect(clock.now()).toBe(minute + 500);
  });

  test("counts a gap at the limit and drops a gap just past it", () => {
    const { clock, setMono } = manualClock();
    setMono(AWAKE_GAP_LIMIT_MS);
    expect(clock.now()).toBe(AWAKE_GAP_LIMIT_MS);
    setMono(AWAKE_GAP_LIMIT_MS + AWAKE_GAP_LIMIT_MS + 1);
    expect(clock.now()).toBe(AWAKE_GAP_LIMIT_MS);
  });

  test("does not move backward when the monotonic clock steps back", () => {
    const { clock, setMono } = manualClock();
    setMono(1_000);
    expect(clock.now()).toBe(1_000);
    setMono(100);
    expect(clock.now()).toBe(1_000);
    setMono(400);
    expect(clock.now()).toBe(1_300);
  });

  test("a delay survives a clock jump and fires on later awake time", () => {
    const { clock, setMono, tick } = manualClock();
    const fired: string[] = [];
    clock.delay(1_000, () => fired.push("early"));
    clock.delay(2_000, () => fired.push("late"));

    setMono(400);
    tick();
    expect(fired).toEqual([]);

    setMono(400 + 60 * 60 * 1_000);
    tick();
    expect(fired).toEqual([]);
    expect(clock.now()).toBe(400);

    setMono(400 + 60 * 60 * 1_000 + 600);
    tick();
    expect(fired).toEqual(["early"]);

    setMono(400 + 60 * 60 * 1_000 + 1_600);
    tick();
    expect(fired).toEqual(["early", "late"]);
  });

  test("a cancelled delay does not fire", () => {
    const { clock, setMono, tick } = manualClock();
    let fired = false;
    const cancel = clock.delay(100, () => {
      fired = true;
    });
    cancel();
    setMono(500);
    tick();
    expect(fired).toBe(false);
  });

  test("stop does not re-arm the tick", () => {
    let armed = 0;
    let pending: (() => void) | null = null;
    const clock = new AwakeClock({
      readMono: () => 0,
      schedule(cb) {
        armed += 1;
        pending = cb;
        return {
          clear() {
            if (pending === cb) {
              pending = null;
            }
          },
        };
      },
    });
    const inFlight = pending;
    expect(armed).toBe(1);
    clock.stop();
    expect(pending).toBeNull();
    inFlight?.();
    expect(armed).toBe(1);
    expect(pending).toBeNull();
  });
});
