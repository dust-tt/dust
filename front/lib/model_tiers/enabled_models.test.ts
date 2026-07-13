import { Authenticator } from "@app/lib/auth";
import { withModelSelectability } from "@app/lib/model_tiers/enabled_models";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { beforeEach, describe, expect, it } from "vitest";

describe("withModelSelectability", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function userAuthForTierCap(tierName: "cost_efficient" | "balanced") {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await ModelsTierResource.setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
    });

    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  it("keeps full reasoning efforts when models_picker is disabled", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.supportedReasoningEfforts
    );
    expect(model.defaultReasoningEffort).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
  });

  it("keeps full reasoning efforts when models_picker is enabled and user has no tier cap", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "models_picker");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.supportedReasoningEfforts
    );
    expect(model.defaultReasoningEffort).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
  });

  it("filters reasoning efforts to those allowed by the user's tier cap", async () => {
    await FeatureFlagFactory.basic(adminAuth, "models_picker");
    const auth = await userAuthForTierCap("cost_efficient");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: true,
      medium: false,
      high: false,
    });
    expect(model.defaultReasoningEffort).toBe("light");
  });

  it("keeps all reasoning efforts when the user's tier cap includes them", async () => {
    await FeatureFlagFactory.basic(adminAuth, "models_picker");
    const auth = await userAuthForTierCap("balanced");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: true,
      medium: true,
      high: true,
    });
    expect(model.defaultReasoningEffort).toBe("medium");
  });

  it("marks frontier-only models as not selectable when capped at balanced", async () => {
    await FeatureFlagFactory.basic(adminAuth, "models_picker");
    const auth = await userAuthForTierCap("balanced");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(false);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: false,
      medium: false,
      high: false,
    });
  });
});
