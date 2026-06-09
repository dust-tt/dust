import { fetchLiveUserCreditInputs } from "@app/lib/metronome/live_user_credit_inputs";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
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

vi.mock("@app/lib/metronome/live_user_credit_inputs", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/live_user_credit_inputs")
  >("@app/lib/metronome/live_user_credit_inputs");
  return {
    ...actual,
    fetchLiveUserCreditInputs: vi.fn(),
  };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("user_seat"));
  vi.mocked(fetchLiveUserCreditInputs).mockResolvedValue(
    new Ok({
      seatBalanceAwu: 40000,
      seatStartingBalanceAwu: 40000,
      effectiveCapAwuCredits: null,
      capSource: "none",
      consumedAwuCredits: null,
    })
  );
});

describe("credit_state_dispatcher per-user caps", () => {
  it("dispatchPerUserCapReached transitions any seat type", async () => {
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

    await dispatchPerUserCapReached({
      workspace,
      userId: user.sId,
    });

    expect(transitionUserCreditState).toHaveBeenCalledWith(
      // createMembership seeds pro/max seats at user_seat (their initial state).
      expect.objectContaining({ seatType: "pro", creditState: "user_seat" }),
      { type: "per_user_cap_reached" },
      { workspaceId: workspaceType.sId, userId: user.sId }
    );
  });

  it("dispatchPerUserCapResolved passes the live balance into the transition context", async () => {
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

    // A max seat that still has personal balance — the state machine resolves
    // the band from this snapshot (verified in the state machine tests).
    vi.mocked(fetchLiveUserCreditInputs).mockResolvedValue(
      new Ok({
        seatBalanceAwu: 40000,
        seatStartingBalanceAwu: 40000,
        effectiveCapAwuCredits: 50000,
        capSource: "override",
        consumedAwuCredits: 10000,
      })
    );

    await dispatchPerUserCapResolved({
      workspace,
      userId: user.sId,
    });

    expect(fetchLiveUserCreditInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspaceType.sId,
        userId: user.sId,
        seatType: "max",
        metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
      })
    );
    expect(transitionUserCreditState).toHaveBeenCalledWith(
      expect.objectContaining({ seatType: "max", creditState: "user_seat" }),
      { type: "per_user_cap_resolved" },
      {
        workspaceId: workspaceType.sId,
        userId: user.sId,
        seatType: "max",
        liveBalance: {
          seatBalanceAwu: 40000,
          seatStartingBalanceAwu: 40000,
          perUserCapAwuCredits: 50000,
          consumedAwuCredits: 10000,
        },
      }
    );
  });

  it("dispatchPerUserCapResolved dispatches without a live balance when the read fails", async () => {
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

    vi.mocked(fetchLiveUserCreditInputs).mockResolvedValue(
      new Err(new Error("metronome unavailable"))
    );

    await dispatchPerUserCapResolved({
      workspace,
      userId: user.sId,
    });

    // No snapshot → the transition defaults to on_pool (resolved by the machine).
    expect(transitionUserCreditState).toHaveBeenCalledWith(
      expect.objectContaining({ seatType: "max", creditState: "user_seat" }),
      { type: "per_user_cap_resolved" },
      {
        workspaceId: workspaceType.sId,
        userId: user.sId,
        seatType: "max",
        liveBalance: undefined,
      }
    );
  });
});
