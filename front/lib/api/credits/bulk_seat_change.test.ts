import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan } from "@app/lib/api/credits/seat_plan";
import type { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeBulkSeatChangePreview } from "./bulk_seat_change";

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

// Keep a real `SeatPlanError` so the not-configured branch still constructs.
vi.mock("@app/lib/api/credits/seat_plan", () => ({
  getSeatPlan: vi.fn(),
  SeatPlanError: class SeatPlanError extends Error {
    constructor(readonly type: string) {
      super(type);
    }
  },
}));

vi.mock("@app/lib/metronome/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/metronome/contracts")>()),
  getCachedMetronomeCurrentBillingPeriod: vi.fn(),
}));

const auth = {
  getNonNullableWorkspace: () => ({ sId: "w_test", id: 42 }),
} as unknown as Authenticator;

function seatInfo(overrides: Partial<SeatTypeInfo>): SeatTypeInfo {
  return {
    name: "Seat",
    awuCredits: 0,
    awuCreditsPeriod: "monthly",
    priceCents: 1000,
    currency: "usd",
    billingFrequency: "monthly",
    minSeats: 0,
    maxSeats: null,
    assignedCount: 0,
    currentBillingPeriod: null,
    ...overrides,
  };
}

// Wire the external reads: `userIds` become users, each mapped to the given
// current seat type via an active membership.
function mockMembers(seatByUserId: Record<number, MembershipSeatType>) {
  const ids = Object.keys(seatByUserId).map(Number);
  vi.spyOn(UserResource, "fetchByIds").mockResolvedValue(
    ids.map((id) => ({ id })) as unknown as UserResource[]
  );
  vi.spyOn(MembershipResource, "getActiveMemberships").mockResolvedValue({
    memberships: ids.map((id) => ({ userId: id, seatType: seatByUserId[id] })),
    total: ids.length,
    nextPageParams: undefined,
  } as unknown as Awaited<
    ReturnType<typeof MembershipResource.getActiveMemberships>
  >);
}

function mockSeatPlan(seatPlans: SeatPlanResponseBody) {
  vi.mocked(getSeatPlan).mockResolvedValue(new Ok(seatPlans));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
    new Ok({ cycleEnd: new Date("2026-10-01T00:00:00Z") } as never)
  );
});

describe("computeBulkSeatChangePreview — maxSeats cap", () => {
  it("blocks members beyond the target's remaining capacity", async () => {
    mockSeatPlan({
      pro: seatInfo({
        name: "Pro Seat",
        awuCredits: 100,
        maxSeats: 3,
        assignedCount: 1,
      }),
    });
    // 5 members with no seat all want Pro, but only 2 slots remain (cap 3,
    // one already assigned).
    mockMembers({ 1: "none", 2: "none", 3: "none", 4: "none", 5: "none" });

    const result = await computeBulkSeatChangePreview(auth, {
      userIds: ["1", "2", "3", "4", "5"],
      targetSeatType: "pro",
    });

    const preview = unwrap(result);
    expect(preview.targetMaxSeats).toBe(3);
    expect(preview.blockedByCapCount).toBe(3);
    expect(preview.memberCount).toBe(5);

    const immediate = preview.moves.filter((m) => m.kind === "immediate");
    expect(immediate).toHaveLength(1);
    expect(immediate[0].count).toBe(2);

    const proTotal = preview.seatTotals.find((t) => t.seatType === "pro");
    // Assigned-after is clamped to the cap, never above it.
    expect(proTotal?.assignedAfter).toBe(3);
  });

  it("does not block anyone when the target seat is uncapped", async () => {
    mockSeatPlan({
      pro: seatInfo({
        name: "Pro Seat",
        awuCredits: 100,
        maxSeats: null,
        assignedCount: 1,
      }),
    });
    mockMembers({ 1: "none", 2: "none", 3: "none", 4: "none", 5: "none" });

    const result = await computeBulkSeatChangePreview(auth, {
      userIds: ["1", "2", "3", "4", "5"],
      targetSeatType: "pro",
    });

    const preview = unwrap(result);
    expect(preview.blockedByCapCount).toBe(0);
    expect(preview.targetMaxSeats).toBeNull();
    const immediate = preview.moves.filter((m) => m.kind === "immediate");
    expect(immediate[0].count).toBe(5);
  });

  it("gives the limited capacity to immediate moves before deferred ones", async () => {
    mockSeatPlan({
      pro: seatInfo({
        name: "Pro Seat",
        awuCredits: 100,
        maxSeats: 1,
        assignedCount: 0,
      }),
      max: seatInfo({ name: "Max Seat", awuCredits: 200, assignedCount: 1 }),
    });
    // One member joins Pro from no seat (immediate); one is downgraded from
    // Max to Pro (deferred). Only 1 slot: the immediate move wins it.
    mockMembers({ 1: "none", 2: "max" });

    const result = await computeBulkSeatChangePreview(auth, {
      userIds: ["1", "2"],
      targetSeatType: "pro",
    });

    const preview = unwrap(result);
    expect(preview.blockedByCapCount).toBe(1);
    expect(preview.moves.filter((m) => m.kind === "immediate")).toHaveLength(1);
    // The deferred move was fully blocked, so it produces no row.
    expect(preview.moves.filter((m) => m.kind === "deferred")).toHaveLength(0);
  });
});
