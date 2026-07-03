import {
  ADVANCED_MODEL_NOT_ENABLED_ERROR_CODE,
  getAdvancedModelAccessErrorForAgentConfiguration,
} from "@app/lib/advanced_models/access";
import { Authenticator } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { describe, expect, it } from "vitest";

const opusModel = SUPPORTED_MODEL_CONFIGS.find(
  (m) => m.modelId === CLAUDE_OPUS_4_6_MODEL_ID
)!;
const sonnetModel = SUPPORTED_MODEL_CONFIGS.find(
  (m) => m.modelId === CLAUDE_SONNET_4_6_MODEL_ID
)!;

describe("getAdvancedModelAccessErrorForAgentConfiguration", () => {
  it("returns null when models_picker is disabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      auth,
      {
        agentName: "Opus Agent",
        model: opusModel,
        featureFlags: [],
      }
    );

    expect(result).toBeNull();
  });

  it("returns null for non-advanced models when models_picker is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "models_picker");

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      auth,
      {
        agentName: "Sonnet Agent",
        model: sonnetModel,
        featureFlags: ["models_picker"],
      }
    );

    expect(result).toBeNull();
  });

  it("returns null when workspace default allows all advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "models_picker");

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      auth,
      {
        agentName: "Opus Agent",
        model: opusModel,
        featureFlags: ["models_picker"],
      }
    );

    expect(result).toBeNull();
  });

  it("returns an error when the advanced model is disabled at workspace level", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(userAuth, "models_picker");

    await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(adminAuth, {
      providerId: "anthropic",
      modelId: CLAUDE_OPUS_4_6_MODEL_ID,
    });

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      userAuth,
      {
        agentName: "Opus Agent",
        model: opusModel,
        featureFlags: ["models_picker"],
      }
    );

    expect(result?.code).toBe(ADVANCED_MODEL_NOT_ENABLED_ERROR_CODE);
    expect(result?.message).toContain("not enabled for you");
    expect(result?.metadata?.errorTitle).toBe("Advanced model not enabled");
  });

  it("returns an error when all workspace advanced models are disabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(userAuth, "models_picker");

    for (const model of AdvancedModelResource.getAdvancedModels()) {
      await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(
        adminAuth,
        {
          providerId: model.providerId,
          modelId: model.modelId,
        }
      );
    }

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      userAuth,
      {
        agentName: "Opus Agent",
        model: opusModel,
        featureFlags: ["models_picker"],
      }
    );

    expect(result?.code).toBe(ADVANCED_MODEL_NOT_ENABLED_ERROR_CODE);
  });

  it("returns null when the advanced model is granted at workspace level", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(userAuth, "models_picker");

    await AdvancedModelResource.addWorkspaceAllowedAdvancedModel(adminAuth, {
      providerId: "anthropic",
      modelId: CLAUDE_OPUS_4_6_MODEL_ID,
    });

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      userAuth,
      {
        agentName: "Opus Agent",
        model: opusModel,
        featureFlags: ["models_picker"],
      }
    );

    expect(result).toBeNull();
  });

  it("returns null when the advanced model is granted directly to the user", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(userAuth, "models_picker");

    await AdvancedModelResource.addUserAllowedAdvancedModel(adminAuth, {
      userId: user.sId,
      providerId: "anthropic",
      modelId: CLAUDE_OPUS_4_7_MODEL_ID,
    });

    const opus47Model = SUPPORTED_MODEL_CONFIGS.find(
      (m) => m.modelId === CLAUDE_OPUS_4_7_MODEL_ID
    )!;

    const result = await getAdvancedModelAccessErrorForAgentConfiguration(
      userAuth,
      {
        agentName: "Opus 4.7 Agent",
        model: opus47Model,
        featureFlags: ["models_picker"],
      }
    );

    expect(result).toBeNull();
  });
});
