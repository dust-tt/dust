import { maybeAutoUpgradeSeat } from "@app/lib/api/credits/auto_seat_upgrade";
import { recalculatePerUserCapAlertForSeatChange } from "@app/lib/api/membership";
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

vi.mock("@app/lib/api/membership", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/membership")
  >("@app/lib/api/membership");
  return {
    ...actual,
    recalculatePerUserCapAlertForSeatChange: vi.fn(),
  };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("on_pool"));
  vi.mocked(maybeAutoUpgradeSeat).mockResolvedValue(new Ok({ upgraded: false }));
  vi.mocked(recalculatePerUserCapAlertForSeatChange).mockResolvedValue(
    undefined
  );
});

describe("credit_state_dispatcher seat balance", () => {
  it("dispatchSeatBalanceExhausted transitions the seat and always attempts an auto-upgrade", async () => {
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
    // Auto-upgrade is fire-and-forget and runs regardless of the transition
    // outcome.
    expect(maybeAutoUpgradeSeat).toHaveBeenCalledWith({
      workspaceId: workspaceType.sId,
      userId: user.sId,
    });
  });

  it("dispatchSeatBalanceResolved recalculates the cap alert and transitions the seat back", async () => {
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

    expect(recalculatePerUserCapAlertForSeatChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.sId })
    );
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
