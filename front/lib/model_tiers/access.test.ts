import { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import { setUserMaxAllowedTier } from "@app/lib/model_tiers/allowed_tiers";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID, MODEL_STREAMS } from "@app/types/assistant/models/auto";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { beforeEach, describe, expect, it } from "vitest";

describe("getModelTierAccessErrorForAgentConfiguration", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function restrictedUserAuth({
    tierName = "balanced",
  }: {
    tierName?: ModelsTierName;
  } = {}) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
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

  // A stream only ever resolves to a candidate within the member's cap, so
  // checking the resolved model alone would let a member run a stream above it.
  it.each([
    ["auto_complex", "model_tier_not_enabled"],
    ["auto", null],
    ["auto_fast", null],
  ] as const)("tier-checks the %s stream itself, not the model it resolved to", async (modelResolutionMethod, expectedCode) => {
    const auth = await restrictedUserAuth();

    const error = await getModelTierAccessErrorForAgentConfiguration(auth, {
      agentName: "test-agent",
      // Haiku 4.5 is cost_efficient at every effort: a plausible candidate for
      // any stream, and always within a `balanced` member's cap.
      model: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
      modelResolutionMethod,
    });

    expect(error?.code ?? null).toBe(expectedCode);
  });
  // Sidekick is free and picks its own model server-side, so it runs the
  // Standard stream whatever the member's own cap is.
  it.each([
    [GLOBAL_AGENTS_SID.SIDEKICK, null],
    ["agent_test", "model_tier_not_enabled"],
  ] as const)("tier-checks the Standard stream for %s against a Basic-capped member", async (agentSId, expectedCode) => {
    const auth = await restrictedUserAuth({ tierName: "cost_efficient" });
    // The model the Standard stream resolves to for an uncapped member.
    const streamModel = getModelConfigByModelId(
      MODEL_STREAMS[AUTO_MODEL_ID][0].modelId
    );
    if (!streamModel) {
      throw new Error("Standard stream's first candidate is not supported.");
    }

    const error = await getModelTierAccessErrorForAgentConfiguration(auth, {
      agentSId,
      agentName: "test-agent",
      model: streamModel,
      modelResolutionMethod: AUTO_MODEL_ID,
    });

    expect(error?.code ?? null).toBe(expectedCode);
  });
});
