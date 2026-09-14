import { setApiKeySpendLimit } from "@app/lib/api/keys/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("setApiKeySpendLimit", () => {
  it("persists the per-key cap", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);

    const result = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "limited", awuCredits: 25_000 },
    });

    expect(result.isOk()).toBe(true);
    const reloaded = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reloaded?.monthlyCapAwuCredits).toBe(25_000);
  });

  it("clears the per-key cap when set to unlimited", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);
    await key.updateMonthlyCapAwuCredits(10_000);

    const result = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "unlimited" },
    });

    expect(result.isOk()).toBe(true);
    const reloaded = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reloaded?.monthlyCapAwuCredits).toBeNull();
  });
});
