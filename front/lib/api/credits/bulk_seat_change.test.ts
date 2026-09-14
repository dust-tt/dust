import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan } from "@app/lib/api/credits/seat_plan";
import { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeBulkSeatChangePreview } from "./bulk_seat_change";

// Only the Metronome boundary is stubbed: the seat plan (prices/caps/assigned
// counts) and the current billing period. Users, memberships, and the
// authenticator are real factory-backed resources so the preview walks the
// same data the apply path would.
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

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

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

// Create a credit-priced workspace with one member per entry in `seatTypes`,
// preserving order so `userIds` matches the apply order the preview mirrors.
async function makeWorkspaceWithMembers(seatTypes: MembershipSeatType[]) {
  const workspace = await WorkspaceFactory.creditPriced();
  const userIds: string[] = [];
  for (const seatType of seatTypes) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType,
    });
    userIds.push(user.sId);
  }
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth, userIds };
}

function mockSeatPlan(seatPlans: SeatPlanResponseBody) {
  vi.mocked(getSeatPlan).mockResolvedValue(new Ok(seatPlans));
}

beforeEach(() => {
  vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
    new Ok({
      cycleStart: new Date("2026-09-01T00:00:00Z"),
      cycleEnd: new Date("2026-10-01T00:00:00Z"),
    })
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
    const { auth, userIds } = await makeWorkspaceWithMembers([
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);

    const preview = unwrap(
      await computeBulkSeatChangePreview(auth, {
        userIds,
        targetSeatType: "pro",
      })
    );

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
    const { auth, userIds } = await makeWorkspaceWithMembers([
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);

    const preview = unwrap(
      await computeBulkSeatChangePreview(auth, {
        userIds,
        targetSeatType: "pro",
      })
    );

    expect(preview.blockedByCapCount).toBe(0);
    expect(preview.targetMaxSeats).toBeNull();
    const immediate = preview.moves.filter((m) => m.kind === "immediate");
    expect(immediate[0].count).toBe(5);
  });

  it("blocks members in apply order, not grouped by origin seat", async () => {
    // Two Max slots and apply order [none, pro, none]: the first two members
    // are accepted, the third (a `none`) is rejected — so the preview must
    // show none×1 + pro×1, not none×2.
    mockSeatPlan({
      pro: seatInfo({ name: "Pro Seat", awuCredits: 100, assignedCount: 0 }),
      max: seatInfo({
        name: "Max Seat",
        awuCredits: 200,
        maxSeats: 2,
        assignedCount: 0,
      }),
    });
    const { auth, userIds } = await makeWorkspaceWithMembers([
      "none",
      "pro",
      "none",
    ]);

    const preview = unwrap(
      await computeBulkSeatChangePreview(auth, {
        userIds,
        targetSeatType: "max",
      })
    );

    expect(preview.blockedByCapCount).toBe(1);
    const immediate = preview.moves.filter((m) => m.kind === "immediate");
    const fromNone = immediate.find((m) => m.fromSeatType === "none");
    const fromPro = immediate.find((m) => m.fromSeatType === "pro");
    expect(fromNone?.count).toBe(1);
    expect(fromPro?.count).toBe(1);
    const maxTotal = preview.seatTotals.find((t) => t.seatType === "max");
    expect(maxTotal?.assignedAfter).toBe(2);
  });

  it("does not let deferred moves consume the cap (matching the apply path)", async () => {
    // Pro cap of one, two Max members downgraded to Pro. Downgrades are
    // deferred: they write future-dated rows without growing Pro's live active
    // count, so the apply path accepts both — and so must the preview.
    mockSeatPlan({
      pro: seatInfo({
        name: "Pro Seat",
        awuCredits: 100,
        maxSeats: 1,
        assignedCount: 0,
      }),
      max: seatInfo({ name: "Max Seat", awuCredits: 200, assignedCount: 2 }),
    });
    const { auth, userIds } = await makeWorkspaceWithMembers(["max", "max"]);

    const preview = unwrap(
      await computeBulkSeatChangePreview(auth, {
        userIds,
        targetSeatType: "pro",
      })
    );

    expect(preview.blockedByCapCount).toBe(0);
    const deferred = preview.moves.filter((m) => m.kind === "deferred");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].count).toBe(2);
  });
});
