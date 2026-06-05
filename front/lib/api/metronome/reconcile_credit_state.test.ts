import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileWorkspaceUserCreditStates } from "./reconcile_credit_state";

const {
  mockListMetronomeSeatBalances,
  mockFetchPerUserAwuUsage,
  mockGetCachedPerUserCapThresholds,
  mockGetCachedDefaultCapThresholdsBySeatType,
} = vi.hoisted(() => ({
  mockListMetronomeSeatBalances: vi.fn(),
  mockFetchPerUserAwuUsage: vi.fn(),
  mockGetCachedPerUserCapThresholds: vi.fn(),
  mockGetCachedDefaultCapThresholdsBySeatType: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomeSeatBalances: mockListMetronomeSeatBalances,
  };
});

vi.mock("@app/lib/metronome/per_user_usage", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/per_user_usage")
  >("@app/lib/metronome/per_user_usage");
  return { ...actual, fetchPerUserAwuUsage: mockFetchPerUserAwuUsage };
});

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/alerts/spend_limits")
  >("@app/lib/metronome/alerts/spend_limits");
  return {
    ...actual,
    getCachedPerUserCapThresholds: mockGetCachedPerUserCapThresholds,
    getCachedDefaultCapThresholdsBySeatType:
      mockGetCachedDefaultCapThresholdsBySeatType,
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_reconcile";
const METRONOME_CONTRACT_ID = "ct_test_reconcile";

function seatBalance(userId: string, balanceAwu: number, startingAwu: number) {
  return {
    seat_id: userId,
    balances: [
      {
        credit_type_id: getCreditTypeAwuId(),
        balance: balanceAwu,
        starting_balance: startingAwu,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPerUserAwuUsage.mockResolvedValue(new Ok(new Map<string, number>()));
  mockGetCachedPerUserCapThresholds.mockResolvedValue({});
  mockGetCachedDefaultCapThresholdsBySeatType.mockResolvedValue({});
});

describe("reconcileWorkspaceUserCreditStates", () => {
  it("moves a stale on_pool pro user with personal balance back to user_seat", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const user = await UserFactory.basic();
    const membership = await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType: "pro",
    });
    // Simulate the stale state the bug leaves users in.
    await membership.updateCreditState("on_pool");

    mockListMetronomeSeatBalances.mockResolvedValue(
      new Ok([seatBalance(user.sId, 8000, 8000)])
    );

    await reconcileWorkspaceUserCreditStates({
      workspace: renderLightWorkspaceType({ workspace }),
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      metronomeContractId: METRONOME_CONTRACT_ID,
    });

    const refreshed =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(refreshed?.creditState).toBe("user_seat");
  });

  it("moves a pro user whose personal balance is exhausted to on_pool", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const user = await UserFactory.basic();
    const membership = await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType: "pro",
    });
    // Factory seeds pro at user_seat; the exhausted balance should flip it.
    expect(membership.creditState).toBe("user_seat");

    mockListMetronomeSeatBalances.mockResolvedValue(
      new Ok([seatBalance(user.sId, 0, 8000)])
    );

    await reconcileWorkspaceUserCreditStates({
      workspace: renderLightWorkspaceType({ workspace }),
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      metronomeContractId: METRONOME_CONTRACT_ID,
    });

    const refreshed =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(refreshed?.creditState).toBe("on_pool");
  });

  it("leaves a workspace (pool-based) user on_pool and reads balances/usage only once", async () => {
    const workspace = await WorkspaceFactory.metronome({
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType: "workspace",
    });

    // Workspace seats have no individual seat allocation.
    mockListMetronomeSeatBalances.mockResolvedValue(new Ok([]));

    await reconcileWorkspaceUserCreditStates({
      workspace: renderLightWorkspaceType({ workspace }),
      metronomeCustomerId: METRONOME_CUSTOMER_ID,
      metronomeContractId: METRONOME_CONTRACT_ID,
    });

    const refreshed =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(refreshed?.creditState).toBe("on_pool");
    // Shared inputs fetched once for the whole workspace, not per user.
    expect(mockListMetronomeSeatBalances).toHaveBeenCalledTimes(1);
    expect(mockFetchPerUserAwuUsage).toHaveBeenCalledTimes(1);
  });
});
