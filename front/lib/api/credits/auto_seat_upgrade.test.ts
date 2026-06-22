import * as workosAudit from "@app/lib/api/audit/workos_audit";

import {
  maybeAutoUpgradeSeat,
  resolveAutoUpgradeTarget,
} from "@app/lib/api/credits/auto_seat_upgrade";
import * as membershipApi from "@app/lib/api/membership";
import * as workspaceApi from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import * as seatUpgradeNotif from "@app/lib/notifications/workflows/seat-auto-upgraded";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `maybeAutoUpgradeSeat` always returns `Ok` (it swallows failures into a no-op),
// so tests assert on the resolved value directly.
function expectOk<T>(result: Result<T, Error>): T {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw new Error("expected Ok result");
  }
  return result.value;
}

// We mock the Metronome boundary (the live contract read + product/seat-type
// catalog) so the entitlement resolution runs against deterministic data, and
// the seat-mutation + side effects (audit, admin notification) so we can assert
// on them without touching Metronome or WorkOS. The pure helper
// `getSeatSubscriptionsFromContract` is intentionally left un-mocked so the real
// entitlement logic is exercised.
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

vi.mock("@app/lib/api/membership", async () => {
  const actual = await vi.importActual<typeof membershipApi>(
    "@app/lib/api/membership"
  );
  return { ...actual, updateMembershipSeatAndTrack: vi.fn() };
});

vi.mock("@app/lib/api/workspace", async () => {
  const actual = await vi.importActual<typeof workspaceApi>(
    "@app/lib/api/workspace"
  );
  return { ...actual, getMembers: vi.fn() };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEventDirect: vi.fn() };
});

vi.mock("@app/lib/notifications/workflows/seat-auto-upgraded", async () => {
  const actual = await vi.importActual<typeof seatUpgradeNotif>(
    "@app/lib/notifications/workflows/seat-auto-upgraded"
  );
  return { ...actual, notifyAdminsSeatAutoUpgraded: vi.fn() };
});

// Build a fake Metronome contract entitling exactly the given seat types, plus a
// matching product→seat-type catalog. Mirrors the contract shape used in
// `seat_types.test.ts`.
function setupEntitledSeats(seatTypeList: MembershipSeatType[]): void {
  const contract = {
    subscriptions: seatTypeList.map((seatType) => ({
      subscription_rate: {
        product: { id: `${seatType}-product`, name: seatType },
      },
    })),
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

async function setup({
  autoSeatUpgradeEnabled,
  seatType,
}: {
  autoSeatUpgradeEnabled: boolean;
  seatType: MembershipSeatType;
}) {
  const workspace = await WorkspaceFactory.creditPriced();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, {
    role: "user",
    seatType,
  });

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  await CreditUsageConfigurationResource.makeNew(auth, {
    autoSeatUpgradeEnabled,
    defaultDiscountPercent: 0,
    usageCapCredits: null,
  });

  return { workspace, user };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workspaceApi.getMembers).mockResolvedValue({
    members: [],
    total: 0,
  });
  vi.mocked(workosAudit.emitAuditLogEventDirect).mockResolvedValue(undefined);
});

describe("resolveAutoUpgradeTarget", () => {
  it("resolves pro to max when max is entitled", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    setupEntitledSeats(["pro", "max"]);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "pro");

    expect(target).toBe("max");
  });

  it("resolves free to pro when pro is entitled", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    setupEntitledSeats(["free", "pro"]);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "free");

    expect(target).toBe("pro");
  });

  it("returns null at the top tier (max has no higher tier)", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    setupEntitledSeats(["pro", "max"]);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "max");

    expect(target).toBeNull();
  });

  it("returns null when the target tier is not entitled", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    // pro would target max, but max is not entitled by the contract.
    setupEntitledSeats(["pro"]);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "pro");

    expect(target).toBeNull();
  });

  it("prefers the monthly cadence over the yearly variant", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    setupEntitledSeats(["pro", "max_yearly", "max"]);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "pro");

    expect(target).toBe("max");
  });

  it("returns null when there is no active contract", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    vi.mocked(planType.getActiveContract).mockResolvedValue(null);

    const target = await resolveAutoUpgradeTarget(workspace.sId, "pro");

    expect(target).toBeNull();
  });

  it("returns null for a null seat type", async () => {
    const workspace = await WorkspaceFactory.creditPriced();

    const target = await resolveAutoUpgradeTarget(workspace.sId, null);

    expect(target).toBeNull();
  });
});

describe("maybeAutoUpgradeSeat", () => {
  it("upgrades a pro member to max, emits audit, and notifies admins", async () => {
    const { workspace, user } = await setup({
      autoSeatUpgradeEnabled: true,
      seatType: "pro",
    });
    setupEntitledSeats(["pro", "max"]);
    vi.mocked(membershipApi.updateMembershipSeatAndTrack).mockResolvedValue(
      new Ok({
        previousSeatType: "pro",
        newSeatType: "max",
        scheduledSeatChangeAt: undefined,
      })
    );

    const result = await maybeAutoUpgradeSeat({
      workspaceId: workspace.sId,
      userId: user.sId,
    });

    expect(expectOk(result)).toEqual({ upgraded: true });

    expect(membershipApi.updateMembershipSeatAndTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        newSeatType: "max",
        author: "no-author",
      })
    );
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "membership.seat_auto_upgraded",
        metadata: { previous_seat_type: "pro", new_seat_type: "max" },
      })
    );
    expect(seatUpgradeNotif.notifyAdminsSeatAutoUpgraded).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSeatType: "pro",
        newSeatType: "max",
      })
    );
  });

  it("no-ops when the workspace toggle is off", async () => {
    const { workspace, user } = await setup({
      autoSeatUpgradeEnabled: false,
      seatType: "pro",
    });
    setupEntitledSeats(["pro", "max"]);

    const result = await maybeAutoUpgradeSeat({
      workspaceId: workspace.sId,
      userId: user.sId,
    });

    expect(expectOk(result)).toEqual({ upgraded: false });
    expect(membershipApi.updateMembershipSeatAndTrack).not.toHaveBeenCalled();
    expect(workosAudit.emitAuditLogEventDirect).not.toHaveBeenCalled();
  });

  it("no-ops when the member is already at the top entitled tier", async () => {
    const { workspace, user } = await setup({
      autoSeatUpgradeEnabled: true,
      seatType: "max",
    });
    setupEntitledSeats(["pro", "max"]);

    const result = await maybeAutoUpgradeSeat({
      workspaceId: workspace.sId,
      userId: user.sId,
    });

    expect(expectOk(result)).toEqual({ upgraded: false });
    expect(membershipApi.updateMembershipSeatAndTrack).not.toHaveBeenCalled();
  });

  it("no-ops without audit/notify when the seat update fails", async () => {
    const { workspace, user } = await setup({
      autoSeatUpgradeEnabled: true,
      seatType: "pro",
    });
    setupEntitledSeats(["pro", "max"]);
    vi.mocked(membershipApi.updateMembershipSeatAndTrack).mockResolvedValue(
      new Err({ type: "metronome_error" })
    );

    const result = await maybeAutoUpgradeSeat({
      workspaceId: workspace.sId,
      userId: user.sId,
    });

    expect(expectOk(result)).toEqual({ upgraded: false });
    expect(workosAudit.emitAuditLogEventDirect).not.toHaveBeenCalled();
    expect(
      seatUpgradeNotif.notifyAdminsSeatAutoUpgraded
    ).not.toHaveBeenCalled();
  });

  it("no-ops without audit/notify when the applied seat is unchanged", async () => {
    const { workspace, user } = await setup({
      autoSeatUpgradeEnabled: true,
      seatType: "pro",
    });
    setupEntitledSeats(["pro", "max"]);
    vi.mocked(membershipApi.updateMembershipSeatAndTrack).mockResolvedValue(
      new Ok({
        previousSeatType: "pro",
        newSeatType: "pro",
        scheduledSeatChangeAt: undefined,
      })
    );

    const result = await maybeAutoUpgradeSeat({
      workspaceId: workspace.sId,
      userId: user.sId,
    });

    expect(expectOk(result)).toEqual({ upgraded: false });
    expect(workosAudit.emitAuditLogEventDirect).not.toHaveBeenCalled();
  });
});
