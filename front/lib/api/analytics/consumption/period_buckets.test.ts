import { splitConsumptionPeriodIntoBuckets } from "@app/lib/api/analytics/consumption/period_buckets";
import { describe, expect, it } from "vitest";

describe("splitConsumptionPeriodIntoBuckets", () => {
  it("splits a period into fixed 6-hour windows", () => {
    const buckets = splitConsumptionPeriodIntoBuckets({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
    });

    expect(buckets).toEqual([
      {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-01T06:00:00.000Z",
      },
      {
        startDate: "2026-08-01T06:00:00.000Z",
        endDate: "2026-08-01T12:00:00.000Z",
      },
      {
        startDate: "2026-08-01T12:00:00.000Z",
        endDate: "2026-08-01T18:00:00.000Z",
      },
      {
        startDate: "2026-08-01T18:00:00.000Z",
        endDate: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });

  it("clips the last bucket to the period's end date", () => {
    const buckets = splitConsumptionPeriodIntoBuckets({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-01T07:30:00.000Z",
    });

    expect(buckets).toEqual([
      {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-01T06:00:00.000Z",
      },
      {
        startDate: "2026-08-01T06:00:00.000Z",
        endDate: "2026-08-01T07:30:00.000Z",
      },
    ]);
  });

  it("returns no buckets for an empty period", () => {
    const buckets = splitConsumptionPeriodIntoBuckets({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-01T00:00:00.000Z",
    });

    expect(buckets).toEqual([]);
  });
});
