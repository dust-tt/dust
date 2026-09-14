import { applyMembershipSeatChangesForWorkspace } from "@app/lib/api/membership_seats";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return { ...actual, getProductSeatTypes: vi.fn() };
});

// Mock a Metronome contract that entitles and bills each listed seat type, so
// the batch resolves a Metronome context and classifies upgrades as immediate.
function setupEntitledSeats(seatTypeList: MembershipSeatType[]): void {
  const contract = {
    subscriptions: seatTypeList.map((seatType) => ({
      subscription_rate: {
        product: { id: `${seatType}-product`, name: seatType },
      },
    })),
    recurring_credits: [],
    overrides: seatTypeList.map((seatType) => ({
      entitled: true,
      product: { id: `${seatType}-product` },
    })),
  } as unknown as CachedContract;

  const catalog = new Map<string, MembershipSeatType>(
    seatTypeList.map((seatType) => [`${seatType}-product`, seatType])
  );

  vi.mocked(planType.getActiveContract).mockResolvedValue(contract);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(catalog);
}

async function seatTypeOf(
  workspace: WorkspaceType,
  user: UserResource
): Promise<MembershipSeatType | null> {
  const m = await MembershipResource.getActiveMembershipOfUserInWorkspace({
    user,
    workspace,
  });
  return m?.seatType ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyMembershipSeatChangesForWorkspace", () => {
  it("enforces the maxSeats cap against a running count across the batch", async () => {
    setupEntitledSeats(["pro"]);

    const workspace = await WorkspaceFactory.creditPriced();
    await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 0,
      maxSeats: 2,
    });

    // Four members with no seat all want Pro, but only two slots exist.
    const users: UserResource[] = [];
    for (let i = 0; i < 4; i++) {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, {
        role: "user",
        seatType: "none",
      });
      users.push(user);
    }

    const results = await applyMembershipSeatChangesForWorkspace({
      workspace,
      changes: users.map((user) => ({ user, newSeatType: "pro" as const })),
      author: "no-author",
    });

    const okCount = results.filter((r) => r.result.isOk()).length;
    const cappedCount = results.filter(
      (r) => r.result.isErr() && r.result.error.type === "seat_limit_reached"
    ).length;
    expect(okCount).toBe(2);
    expect(cappedCount).toBe(2);

    // Exactly two members actually landed on Pro.
    const seats = await Promise.all(users.map((u) => seatTypeOf(workspace, u)));
    expect(seats.filter((s) => s === "pro")).toHaveLength(2);
  });

  it("reads each per-workspace input once regardless of batch size", async () => {
    setupEntitledSeats(["pro"]);

    const workspace = await WorkspaceFactory.creditPriced();
    const users: UserResource[] = [];
    for (let i = 0; i < 3; i++) {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, {
        role: "user",
        seatType: "none",
      });
      users.push(user);
    }

    const activeSpy = vi.spyOn(MembershipResource, "getActiveMemberships");
    const scheduledSpy = vi.spyOn(
      MembershipResource,
      "getScheduledMembershipsByUserIdInWorkspace"
    );
    const countsSpy = vi.spyOn(
      MembershipResource,
      "getActiveSeatTypeCountsForWorkspace"
    );
    const limitsSpy = vi.spyOn(WorkspaceSeatLimitResource, "fetchByWorkspace");

    await applyMembershipSeatChangesForWorkspace({
      workspace,
      changes: users.map((user) => ({ user, newSeatType: "pro" as const })),
      author: "no-author",
    });

    // No per-member fan-out: one query each for the whole batch.
    expect(activeSpy).toHaveBeenCalledTimes(1);
    expect(scheduledSpy).toHaveBeenCalledTimes(1);
    expect(countsSpy).toHaveBeenCalledTimes(1);
    expect(limitsSpy).toHaveBeenCalledTimes(1);
  });

  it("returns not_found for a user without an active membership", async () => {
    setupEntitledSeats(["pro"]);

    const workspace = await WorkspaceFactory.creditPriced();
    const stranger = await UserFactory.basic();

    const results = await applyMembershipSeatChangesForWorkspace({
      workspace,
      changes: [{ user: stranger, newSeatType: "pro" }],
      author: "no-author",
    });

    expect(results).toHaveLength(1);
    expect(results[0].result.isErr()).toBe(true);
    if (results[0].result.isErr()) {
      expect(results[0].result.error.type).toBe("not_found");
    }
  });

  it("returns an empty array for no changes without touching the DB", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const activeSpy = vi.spyOn(MembershipResource, "getActiveMemberships");

    const results = await applyMembershipSeatChangesForWorkspace({
      workspace,
      changes: [],
      author: "no-author",
    });

    expect(results).toEqual([]);
    expect(activeSpy).not.toHaveBeenCalled();
  });
});
