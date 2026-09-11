import { maybeAutoUpgradeSeat } from "@app/lib/api/credits/auto_seat_upgrade";
import { PostHogServerSideTracking } from "@app/lib/api/posthog";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchSeatBalanceExhausted,
  dispatchSeatBalanceResolved,
} from "./credit_state_dispatcher";

vi.mock("@app/lib/metronome/user_credit_state_machine", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/user_credit_state_machine")
  >("@app/lib/metronome/user_credit_state_machine");
  return {
    ...actual,
    transitionUserCreditState: vi.fn(),
  };
});

vi.mock("@app/lib/api/credits/auto_seat_upgrade", () => ({
  maybeAutoUpgradeSeat: vi.fn(),
}));

vi.mock("@app/lib/api/posthog", () => ({
  PostHogServerSideTracking: { trackEvent: vi.fn() },
}));

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("on_pool"));
  vi.mocked(maybeAutoUpgradeSeat).mockResolvedValue(
    new Ok({ upgraded: false })
  );
});

describe("credit_state_dispatcher seat balance", () => {
  it("dispatchSeatBalanceExhausted transitions the seat without auto-upgrading", async () => {
    const workspaceType = await WorkspaceFactory.metronome({
      metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
    });
    const workspace = await WorkspaceResource.fetchById(workspaceType.sId);
    expect(workspace).not.toBeNull();
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspaceType, user, {
      role: "user",
      seatType: "pro",
    });

    await dispatchSeatBalanceExhausted({
      workspace,
      userId: user.sId,
    });

    expect(transitionUserCreditState).toHaveBeenCalledWith(
      // createMembership seeds pro/max seats at user_seat (their initial state).
      expect.objectContaining({ seatType: "pro", creditState: "user_seat" }),
      { type: "seat_balance_exhausted" },
      expect.objectContaining({
        workspaceId: workspaceType.sId,
        userId: user.sId,
        seatType: "pro",
      })
    );
    // Auto-upgrade is no longer driven from the seat-balance webhook: it runs
    // reactively at message-send time when the user is actually blocked.
    expect(maybeAutoUpgradeSeat).not.toHaveBeenCalled();
  });

  it("dispatchSeatBalanceResolved transitions the seat back", async () => {
    const workspaceType = await WorkspaceFactory.metronome({
      metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
    });
    const workspace = await WorkspaceResource.fetchById(workspaceType.sId);
    expect(workspace).not.toBeNull();
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspaceType, user, {
      role: "user",
      seatType: "max",
    });

    await dispatchSeatBalanceResolved({
      workspace,
      userId: user.sId,
    });

    expect(transitionUserCreditState).toHaveBeenCalledWith(
      expect.objectContaining({ seatType: "max", creditState: "user_seat" }),
      { type: "seat_balance_resolved" },
      {
        workspaceId: workspaceType.sId,
        userId: user.sId,
        seatType: "max",
      }
    );
  });
});

describe("credit_state_dispatcher seat exhaustion tracking", () => {
  async function setupProSeat() {
    const workspaceType = await WorkspaceFactory.metronome({
      metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
    });
    const workspace = await WorkspaceResource.fetchById(workspaceType.sId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    const user = await UserFactory.basic();
    const membership = await MembershipFactory.associate(workspaceType, user, {
      role: "user",
      seatType: "pro",
    });
    return { workspace, workspaceType, user, membership };
  }

  it("tracks seat_credits_exhausted when the seat balance runs out", async () => {
    const { workspace, workspaceType, user } = await setupProSeat();
    vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("on_pool"));

    await dispatchSeatBalanceExhausted({ workspace, userId: user.sId });

    expect(PostHogServerSideTracking.trackEvent).toHaveBeenCalledWith({
      distinctId: user.sId,
      event: "seat_credits_exhausted",
      workspaceId: workspaceType.sId,
      extra: {
        seat_type: "pro",
        pool_limit_credits: 0,
      },
    });
  });

  it("does not track again for a seat already off its personal balance", async () => {
    const { workspace, user, membership } = await setupProSeat();
    await membership.updateCreditState("on_pool");
    vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("on_pool"));

    await dispatchSeatBalanceExhausted({ workspace, userId: user.sId });

    expect(PostHogServerSideTracking.trackEvent).not.toHaveBeenCalled();
  });
});
