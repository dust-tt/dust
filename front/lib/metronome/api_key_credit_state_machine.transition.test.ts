import { setApiKeyCreditState } from "@app/lib/metronome/api_key_block";
import { transitionApiKeyCreditState } from "@app/lib/metronome/api_key_credit_state_machine";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/api_key_block", () => ({
  setApiKeyCreditState: vi.fn().mockResolvedValue(undefined),
}));

describe("transitionApiKeyCreditState", () => {
  let globalGroup: GroupResource;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    vi.mocked(setApiKeyCreditState).mockClear();
    const testSetup = await createResourceTest({ role: "admin" });
    globalGroup = testSetup.globalGroup;
    workspace = testSetup.authenticator.getNonNullableWorkspace();
  });

  it("moves on_pool -> capped on api_key_cap_reached and persists", async () => {
    const key = await KeyFactory.regular(globalGroup);
    expect(key.creditState).toBe("on_pool");

    const result = await transitionApiKeyCreditState(
      key,
      { type: "api_key_cap_reached" },
      { workspaceId: workspace.sId, keyModelId: key.id }
    );

    expect(result.isOk()).toBe(true);
    expect(key.creditState).toBe("capped");
    expect(setApiKeyCreditState).toHaveBeenCalledWith(
      workspace.sId,
      key.id,
      "capped"
    );

    const reFetched = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reFetched?.creditState).toBe("capped");
  });

  it("moves capped -> on_pool on api_key_cap_resolved", async () => {
    const key = await KeyFactory.regular(globalGroup);
    await key.updateCreditState("capped");

    const result = await transitionApiKeyCreditState(
      key,
      { type: "api_key_cap_resolved" },
      { workspaceId: workspace.sId, keyModelId: key.id }
    );

    expect(result.isOk()).toBe(true);
    expect(key.creditState).toBe("on_pool");
  });

  it("un-caps on admin_cap_cleared", async () => {
    const key = await KeyFactory.regular(globalGroup);
    await key.updateCreditState("capped");

    const result = await transitionApiKeyCreditState(
      key,
      { type: "admin_cap_cleared" },
      { workspaceId: workspace.sId, keyModelId: key.id }
    );

    expect(result.isOk()).toBe(true);
    expect(key.creditState).toBe("on_pool");
  });
});
