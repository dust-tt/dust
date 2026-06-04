import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
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

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(transitionUserCreditState).mockResolvedValue(new Ok("on_pool"));
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
      expect.objectContaining({ seatType: "pro", creditState: "on_pool" }),
      { type: "per_user_cap_reached" },
      { workspaceId: workspaceType.sId, userId: user.sId }
    );
  });

  it("dispatchPerUserCapResolved transitions any seat type", async () => {
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

    await dispatchPerUserCapResolved({
      workspace,
      userId: user.sId,
    });

    expect(transitionUserCreditState).toHaveBeenCalledWith(
      expect.objectContaining({ seatType: "max", creditState: "on_pool" }),
      { type: "per_user_cap_resolved" },
      { workspaceId: workspaceType.sId, userId: user.sId }
    );
  });
});
