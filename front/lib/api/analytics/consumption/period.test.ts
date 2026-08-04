import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Jul 13 2026 09:30 UTC.
const NOW_MS = Date.UTC(2026, 6, 13, 9, 30);

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth };
}

describe("resolveConsumptionPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a days window to [start-of-day (days-1 ago), now]", async () => {
    const { auth } = await setup();

    const period = await resolveConsumptionPeriod(auth, {
      kind: "days",
      days: 7,
    });

    expect(period).toEqual({
      // 6 days before Jul 13, floored to midnight.
      startDate: "2026-07-07T00:00:00.000Z",
      endDate: "2026-07-13T09:30:00.000Z",
    });
  });

  it("resolves the cycle to the current UTC calendar month for a workspace with no billing cycle", async () => {
    const { auth } = await setup();

    const period = await resolveConsumptionPeriod(auth, { kind: "cycle" });

    expect(period).toEqual({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-08-01T00:00:00.000Z",
    });
  });
});
