import {
  getDefaultModelFromEnabledModels,
  withModelSelectability,
} from "@app/lib/advanced_models/enabled_models";
import { Authenticator } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { GPT_5_5_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

const opusModel = SUPPORTED_MODEL_CONFIGS.find(
  (m) => m.modelId === CLAUDE_OPUS_4_6_MODEL_ID
)!;
const sonnetModel = SUPPORTED_MODEL_CONFIGS.find(
  (m) => m.modelId === CLAUDE_SONNET_4_6_MODEL_ID
)!;

function getModelSelectability(
  models: Awaited<ReturnType<typeof withModelSelectability>>,
  modelId: string
): boolean | undefined {
  return models.find((model) => model.modelId === modelId)?.isSelectable;
}

describe("withModelSelectability", () => {
  it("marks every model as selectable when models_picker is disabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await withModelSelectability(auth, {
      models: [opusModel, sonnetModel],
    });

    expect(getModelSelectability(result, opusModel.modelId)).toBe(true);
    expect(getModelSelectability(result, sonnetModel.modelId)).toBe(true);
  });

  it("marks non-advanced models as selectable when models_picker is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "models_picker");

    const result = await withModelSelectability(auth, {
      models: [sonnetModel],
    });

    expect(getModelSelectability(result, sonnetModel.modelId)).toBe(true);
  });

  it("marks advanced models as not selectable when they are not allowed", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(auth, "models_picker");

    await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(adminAuth, {
      providerId: opusModel.providerId,
      modelId: opusModel.modelId,
    });

    const result = await withModelSelectability(auth, {
      models: [opusModel],
    });

    expect(getModelSelectability(result, opusModel.modelId)).toBe(false);
  });

  it("marks advanced models as selectable when they are allowed", async () => {
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

    const result = await withModelSelectability(userAuth, {
      models: [opusModel, sonnetModel],
    });

    expect(getModelSelectability(result, opusModel.modelId)).toBe(true);
    expect(getModelSelectability(result, sonnetModel.modelId)).toBe(true);
  });
});

describe("getDefaultModelFromEnabledModels", () => {
  it("picks the first selectable model in the preferred order", () => {
    const defaultModel = getDefaultModelFromEnabledModels([
      { ...GPT_5_5_MODEL_CONFIG, isSelectable: true },
      { ...CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG, isSelectable: true },
    ]);

    expect(defaultModel.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(defaultModel.isSelectable).toBe(true);
  });

  it("skips models that are not selectable", () => {
    const defaultModel = getDefaultModelFromEnabledModels([
      { ...CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG, isSelectable: false },
      { ...GPT_5_5_MODEL_CONFIG, isSelectable: true },
    ]);

    expect(defaultModel.modelId).toBe(GPT_5_5_MODEL_CONFIG.modelId);
  });

  it("falls back to the hardcoded default when no selectable models exist", () => {
    const defaultModel = getDefaultModelFromEnabledModels([
      { ...CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, isSelectable: false },
    ]);

    expect(defaultModel.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(defaultModel.isSelectable).toBe(true);
  });
});
