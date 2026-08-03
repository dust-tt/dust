import { buildUsageQuerySegments } from "@app/lib/metronome/per_user_usage";
import { describe, expect, it } from "vitest";

describe("buildUsageQuerySegments", () => {
  it("returns a single DAY segment when both boundaries are UTC midnight", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-01T00:00:00.000Z"),
      requestEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-01T00:00:00.000Z",
        endingBefore: "2026-07-01T00:00:00.000Z",
        windowSize: "DAY",
      },
    ]);
  });

  it("adds an HOUR segment for a non-midnight start, DAY for the interior", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-15T15:00:00.000Z"),
      requestEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-15T00:00:00.000Z",
        endingBefore: "2026-06-16T00:00:00.000Z",
        windowSize: "HOUR",
      },
      {
        startingOn: "2026-06-16T00:00:00.000Z",
        endingBefore: "2026-07-01T00:00:00.000Z",
        windowSize: "DAY",
      },
    ]);
  });

  it("adds an HOUR segment for a non-midnight end, DAY for the interior", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-01T00:00:00.000Z"),
      requestEnd: new Date("2026-06-20T09:30:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-01T00:00:00.000Z",
        endingBefore: "2026-06-20T00:00:00.000Z",
        windowSize: "DAY",
      },
      {
        startingOn: "2026-06-20T00:00:00.000Z",
        endingBefore: "2026-06-21T00:00:00.000Z",
        windowSize: "HOUR",
      },
    ]);
  });

  it("produces HOUR + DAY + HOUR for non-midnight start and end, multi-day", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-15T15:00:00.000Z"),
      requestEnd: new Date("2026-06-20T09:30:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-15T00:00:00.000Z",
        endingBefore: "2026-06-16T00:00:00.000Z",
        windowSize: "HOUR",
      },
      {
        startingOn: "2026-06-16T00:00:00.000Z",
        endingBefore: "2026-06-20T00:00:00.000Z",
        windowSize: "DAY",
      },
      {
        startingOn: "2026-06-20T00:00:00.000Z",
        endingBefore: "2026-06-21T00:00:00.000Z",
        windowSize: "HOUR",
      },
    ]);
  });

  it("collapses to a single HOUR segment when the range is confined to one day", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-15T12:00:00.000Z"),
      requestEnd: new Date("2026-06-15T18:00:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-15T00:00:00.000Z",
        endingBefore: "2026-06-16T00:00:00.000Z",
        windowSize: "HOUR",
      },
    ]);
  });

  it("collapses to a single HOUR segment when the range crosses exactly one midnight with no interior day", () => {
    const segments = buildUsageQuerySegments({
      cycleStart: new Date("2026-06-15T18:00:00.000Z"),
      requestEnd: new Date("2026-06-16T06:00:00.000Z"),
    });
    expect(segments).toEqual([
      {
        startingOn: "2026-06-15T00:00:00.000Z",
        endingBefore: "2026-06-17T00:00:00.000Z",
        windowSize: "HOUR",
      },
    ]);
  });

  it("returns no segments when requestEnd does not come after cycleStart", () => {
    const sameInstant = new Date("2026-06-15T12:00:00.000Z");
    expect(
      buildUsageQuerySegments({
        cycleStart: sameInstant,
        requestEnd: sameInstant,
      })
    ).toEqual([]);
    expect(
      buildUsageQuerySegments({
        cycleStart: new Date("2026-06-15T12:00:00.000Z"),
        requestEnd: new Date("2026-06-15T11:00:00.000Z"),
      })
    ).toEqual([]);
  });

  it("produces contiguous, non-overlapping segments covering the full range", () => {
    const cycleStart = new Date("2026-06-15T15:00:00.000Z");
    const requestEnd = new Date("2026-09-02T03:00:00.000Z");
    const segments = buildUsageQuerySegments({ cycleStart, requestEnd });

    expect(segments[0].startingOn).toBe(
      new Date(
        Date.UTC(
          cycleStart.getUTCFullYear(),
          cycleStart.getUTCMonth(),
          cycleStart.getUTCDate()
        )
      ).toISOString()
    );
    expect(segments.at(-1)?.endingBefore).toBe(
      new Date(
        Date.UTC(
          requestEnd.getUTCFullYear(),
          requestEnd.getUTCMonth(),
          requestEnd.getUTCDate() + 1
        )
      ).toISOString()
    );
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startingOn).toBe(segments[i - 1].endingBefore);
    }
  });
});
