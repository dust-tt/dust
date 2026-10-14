import { makeMetronomePacer } from "@app/lib/metronome/pacing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("makeMetronomePacer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces concurrent calls by 1000 / maxRps ms, in call order", async () => {
    const pace = makeMetronomePacer({ maxRps: 10 });
    const startedAt: number[] = [];
    const record = async () => {
      startedAt.push(Date.now());
    };

    const all = Promise.all([pace(record), pace(record), pace(record)]);
    await vi.runAllTimersAsync();
    await all;

    expect(startedAt).toEqual([0, 100, 200]);
  });

  it("does not share pacing between pacers", async () => {
    const a = makeMetronomePacer({ maxRps: 1 });
    const b = makeMetronomePacer({ maxRps: 1 });
    await a(async () => undefined);

    const startedAt: number[] = [];
    await b(async () => {
      startedAt.push(Date.now());
    });

    expect(startedAt).toEqual([0]);
  });
});
