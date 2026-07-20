import { describe, expect, it } from "bun:test";
import {
  formatDurationSeconds,
  type LifecycleConfig,
  parseDurationSeconds,
  resolveLifecyclePolicy,
} from "../../src/lib/lifecycle-config";

describe("lifecycle config", () => {
  it("parses supported duration units and disabled transitions", () => {
    expect(parseDurationSeconds("30m")).toEqual({ ok: true, value: 1800 });
    expect(parseDurationSeconds("8h")).toEqual({ ok: true, value: 28800 });
    expect(parseDurationSeconds("7d")).toEqual({ ok: true, value: 604800 });
    expect(parseDurationSeconds("never")).toEqual({ ok: true, value: null });
    expect(parseDurationSeconds("30").ok).toBe(false);
  });

  it("formats durations for status output", () => {
    expect(formatDurationSeconds(1800)).toBe("30m");
    expect(formatDurationSeconds(28800)).toBe("8h");
    expect(formatDurationSeconds(null)).toBe("never");
  });

  it("applies per-environment overrides to a profile", () => {
    const config: LifecycleConfig = {
      scanIntervalSeconds: 30,
      dryRun: false,
      profiles: {
        fast: {
          coldAfterSeconds: 60,
          stopAfterSeconds: 120,
          deleteAfterSeconds: null,
          trackSourceChanges: true,
          trackFrontend: true,
          blockDeleteIfSessionExists: false,
        },
      },
      environments: {},
    };
    const result = resolveLifecyclePolicy(config, {
      profile: "fast",
      overrides: { stopAfterSeconds: 300 },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        coldAfterSeconds: 60,
        stopAfterSeconds: 300,
        deleteAfterSeconds: null,
        trackSourceChanges: true,
        trackFrontend: true,
        blockDeleteIfSessionExists: false,
      },
    });
  });
});
