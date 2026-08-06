import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { Authenticator } from "@app/lib/auth";
import type * as contracts from "@app/lib/metronome/contracts";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/contracts", async () => {
  const actual = await vi.importActual<typeof contracts>(
    "@app/lib/metronome/contracts"
  );
  return { ...actual, getCachedMetronomeCurrentBillingPeriod: vi.fn() };
});

// Jul 13 2026 09:30 UTC.
const NOW_MS = Date.UTC(2026, 6, 13, 9, 30);

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth };
}

// A workspace on a credit-priced (`CP_`) plan: the only case where the billing
// cycle is resolved from Metronome rather than the calendar month.
async function setupCreditPriced() {
  const workspace = await WorkspaceFactory.creditPriced();
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

  it("resolves the cycle to the Metronome billing cycle for a credit-priced workspace", async () => {
    const { auth } = await setupCreditPriced();

    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok({
        cycleStart: new Date(Date.UTC(2026, 5, 18)),
        cycleEnd: new Date(Date.UTC(2026, 6, 18)),
      })
    );

    const period = await resolveConsumptionPeriod(auth, { kind: "cycle" });

    expect(getCachedMetronomeCurrentBillingPeriod).toHaveBeenCalledWith(
      auth.getNonNullableWorkspace().sId
    );
    expect(period).toEqual({
      startDate: "2026-06-18T00:00:00.000Z",
      endDate: "2026-07-18T00:00:00.000Z",
    });
  });

  it("falls back to the calendar month when the billing cycle cannot be resolved", async () => {
    const { auth } = await setupCreditPriced();

    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Err(new Error("metronome unavailable"))
    );

    const period = await resolveConsumptionPeriod(auth, { kind: "cycle" });

    expect(period).toEqual({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-08-01T00:00:00.000Z",
    });
  });

  it("falls back to the calendar month when the workspace has no billing period", async () => {
    const { auth } = await setupCreditPriced();

    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok(null)
    );

    const period = await resolveConsumptionPeriod(auth, { kind: "cycle" });

    expect(period).toEqual({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-08-01T00:00:00.000Z",
    });
  });
});
