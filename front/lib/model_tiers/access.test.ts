import { Authenticator } from "@app/lib/auth";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isKillSwitchEnabled = vi.hoisted(() => vi.fn().mockResolvedValue(false));
vi.mock("@app/lib/resources/kill_switch_resource", () => ({
  KillSwitchResource: {
    isKillSwitchEnabled,
    listEnabledKillSwitches: vi.fn().mockResolvedValue([]),
  },
}));

describe("getModelTierAccessErrorForAgentConfiguration", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    isKillSwitchEnabled.mockResolvedValue(false);
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function restrictedUserAuth() {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await ModelsTierResource.setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName: "balanced",
    });

    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  async function allowRestrictedModelsForPublishedAgents() {
    const resource = await WorkspaceResource.fetchById(workspace.sId);
    if (!resource) {
      throw new Error("Workspace not found.");
    }
    await resource.updateWorkspaceSettings({
      metadata: { allowRestrictedModelsForPublishedAgents: true },
    });
  }

  function accessErrorFor(
    auth: Authenticator,
    { agentScope }: { agentScope?: "visible" | "hidden" } = {}
  ) {
    return getModelTierAccessErrorForAgentConfiguration(auth, {
      agentName: "test-agent",
      model: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
      agentScope,
    });
  }

  it("blocks a published agent run when the override is off", async () => {
    const auth = await restrictedUserAuth();

    const error = await accessErrorFor(auth, { agentScope: "visible" });

    expect(error?.code).toBe("model_tier_not_enabled");
  });

  it("allows a published agent run when the override is on", async () => {
    await allowRestrictedModelsForPublishedAgents();
    const auth = await restrictedUserAuth();

    const error = await accessErrorFor(auth, { agentScope: "visible" });

    expect(error).toBeNull();
  });

  it("still blocks unpublished agent runs when the override is on", async () => {
    await allowRestrictedModelsForPublishedAgents();
    const auth = await restrictedUserAuth();

    const error = await accessErrorFor(auth, { agentScope: "hidden" });

    expect(error?.code).toBe("model_tier_not_enabled");
  });

  it("still blocks the creation path (no agentScope) when the override is on", async () => {
    await allowRestrictedModelsForPublishedAgents();
    const auth = await restrictedUserAuth();

    const error = await accessErrorFor(auth);

    expect(error?.code).toBe("model_tier_not_enabled");
  });

  it("does not block when the model picker is disabled via kill switch", async () => {
    isKillSwitchEnabled.mockResolvedValue(true);
    const auth = await restrictedUserAuth();

    const error = await getModelTierAccessErrorForAgentConfiguration(auth, {
      agentName: "test-agent",
      model: CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
      agentScope: "visible",
    });

    expect(error).toBeNull();
  });
});
