import { isAdvancedModel } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_OPUS_4_7_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

function createMockModel(
  overrides: Partial<ModelConfigurationType>
): ModelConfigurationType {
  const baseModel = SUPPORTED_MODEL_CONFIGS[0];
  return {
    ...baseModel,
    ...overrides,
  };
}

describe("AdvancedModelResource.getAdvancedModels", () => {
  it("should return all supported models with plansWithAdvancedModels set to true", () => {
    const expectedAdvancedModels =
      SUPPORTED_MODEL_CONFIGS.filter(isAdvancedModel);

    expect(AdvancedModelResource.getAdvancedModels()).toEqual(
      expectedAdvancedModels
    );
    expect(
      AdvancedModelResource.getAdvancedModels().map((m) => m.modelId)
    ).toEqual(
      expect.arrayContaining([
        CLAUDE_OPUS_4_6_MODEL_ID,
        CLAUDE_OPUS_4_7_MODEL_ID,
        CLAUDE_OPUS_4_8_MODEL_ID,
      ])
    );
  });
});

describe("AdvancedModelResource.isAdvancedModel", () => {
  it("should return true when plansWithAdvancedModels is set to true", () => {
    const model = createMockModel({
      availableIfOneOf: { plansWithAdvancedModels: true },
    });

    expect(AdvancedModelResource.isAdvancedModel(model)).toBe(
      isAdvancedModel(model)
    );
  });

  it("should return false when plansWithAdvancedModels is not set", () => {
    const model = createMockModel({
      availableIfOneOf: { featureFlag: "deepseek_feature" },
    });

    expect(AdvancedModelResource.isAdvancedModel(model)).toBe(
      isAdvancedModel(model)
    );
  });
});

describe("AdvancedModelResource admin management", () => {
  const advancedModel = AdvancedModelResource.getAdvancedModels()[0];

  it("should reject non-admin callers", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);

    await expect(
      AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).rejects.toThrow("Only admins can manage allowed advanced models.");
  });

  it("should add, list, and remove workspace allowed advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const addRes = await AdvancedModelResource.addWorkspaceAllowedAdvancedModel(
      auth,
      {
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      }
    );
    expect(addRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual([
      {
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      },
    ]);

    const removeRes =
      await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(auth, {
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      });
    expect(removeRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual([]);
  });

  it("should add, list, and remove user allowed advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const addRes = await AdvancedModelResource.addUserAllowedAdvancedModel(
      auth,
      {
        userId: user.sId,
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      }
    );
    expect(addRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listUserAllowedAdvancedModels(auth)
    ).toEqual([
      {
        userId: user.sId,
        models: [
          {
            providerId: advancedModel.providerId,
            modelId: advancedModel.modelId,
          },
        ],
      },
    ]);

    const removeRes =
      await AdvancedModelResource.removeUserAllowedAdvancedModel(auth, {
        userId: user.sId,
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      });
    expect(removeRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listUserAllowedAdvancedModels(auth)
    ).toEqual([]);
  });

  it("should add, list, and remove group allowed advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await GroupFactory.regular(
      workspace,
      "Advanced models group"
    );
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const addRes = await AdvancedModelResource.addGroupAllowedAdvancedModel(
      auth,
      {
        groupId: makeSId("group", {
          id: group.id,
          workspaceId: workspace.id,
        }),
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      }
    );
    expect(addRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listGroupAllowedAdvancedModels(auth)
    ).toEqual([
      {
        groupId: makeSId("group", {
          id: group.id,
          workspaceId: workspace.id,
        }),
        models: [
          {
            providerId: advancedModel.providerId,
            modelId: advancedModel.modelId,
          },
        ],
      },
    ]);

    const removeRes =
      await AdvancedModelResource.removeGroupAllowedAdvancedModel(auth, {
        groupId: makeSId("group", {
          id: group.id,
          workspaceId: workspace.id,
        }),
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      });
    expect(removeRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listGroupAllowedAdvancedModels(auth)
    ).toEqual([]);
  });

  it("should reject non-advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await AdvancedModelResource.addWorkspaceAllowedAdvancedModel(
      auth,
      {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_request_error");
    }
  });

  it("should reject users that are not workspace members", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await AdvancedModelResource.addUserAllowedAdvancedModel(
      auth,
      {
        userId: user.sId,
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("user_not_member");
    }
  });
});
