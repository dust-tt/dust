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

  it("should list all advanced models by default and support workspace allowlist edits", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const allAdvancedModels = AdvancedModelResource.getAdvancedModels().map(
      (model) => ({
        providerId: model.providerId,
        modelId: model.modelId,
      })
    );

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual(allAdvancedModels);

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
    ).toEqual(allAdvancedModels);

    const removeRes =
      await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(auth, {
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      });
    expect(removeRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual(
      allAdvancedModels.filter(
        (model) =>
          model.providerId !== advancedModel.providerId ||
          model.modelId !== advancedModel.modelId
      )
    );

    const reAddRes =
      await AdvancedModelResource.addWorkspaceAllowedAdvancedModel(auth, {
        providerId: advancedModel.providerId,
        modelId: advancedModel.modelId,
      });
    expect(reAddRes.isOk()).toBe(true);

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual(allAdvancedModels);
  });

  it("should allow disabling all workspace advanced models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    for (const model of AdvancedModelResource.getAdvancedModels()) {
      const removeRes =
        await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(auth, {
          providerId: model.providerId,
          modelId: model.modelId,
        });
      expect(removeRes.isOk()).toBe(true);
    }

    expect(
      await AdvancedModelResource.listWorkspaceAllowedAdvancedModels(auth)
    ).toEqual([]);

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

describe("AdvancedModelResource.resolveAllowedAdvancedModels", () => {
  const opus46 = {
    providerId: "anthropic" as const,
    modelId: CLAUDE_OPUS_4_6_MODEL_ID,
  };
  const opus47 = {
    providerId: "anthropic" as const,
    modelId: CLAUDE_OPUS_4_7_MODEL_ID,
  };
  const opus48 = {
    providerId: "anthropic" as const,
    modelId: CLAUDE_OPUS_4_8_MODEL_ID,
  };

  async function restrictWorkspaceAdvancedModels(
    auth: Authenticator,
    allowedModels: Array<{ providerId: "anthropic"; modelId: string }>
  ) {
    for (const model of AdvancedModelResource.getAdvancedModels()) {
      const isAllowed = allowedModels.some(
        (allowed) =>
          allowed.providerId === model.providerId &&
          allowed.modelId === model.modelId
      );
      if (!isAllowed) {
        await AdvancedModelResource.removeWorkspaceAllowedAdvancedModel(auth, {
          providerId: model.providerId,
          modelId: model.modelId,
        });
      }
    }
  }

  it("returns the union of workspace, group, and user models", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const group = await GroupFactory.regular(workspace, "Engineering");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await GroupFactory.withMembers(adminAuth, group, [user]);

    await restrictWorkspaceAdvancedModels(adminAuth, [opus47]);
    await AdvancedModelResource.addGroupAllowedAdvancedModel(adminAuth, {
      groupId: makeSId("group", {
        id: group.id,
        workspaceId: workspace.id,
      }),
      ...opus46,
    });
    await AdvancedModelResource.addUserAllowedAdvancedModel(adminAuth, {
      userId: user.sId,
      ...opus48,
    });

    const result = await AdvancedModelResource.resolveAllowedAdvancedModels(
      userAuth,
      { user }
    );

    expect(result.models).toHaveLength(3);
    expect(result.hasUserLevelOverride).toBe(true);
  });

  it("deduplicates models present in multiple scopes", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const group = await GroupFactory.regular(workspace, "Engineering");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await GroupFactory.withMembers(adminAuth, group, [user]);

    await restrictWorkspaceAdvancedModels(adminAuth, [opus46]);
    await AdvancedModelResource.addGroupAllowedAdvancedModel(adminAuth, {
      groupId: makeSId("group", {
        id: group.id,
        workspaceId: workspace.id,
      }),
      ...opus46,
    });
    await AdvancedModelResource.addUserAllowedAdvancedModel(adminAuth, {
      userId: user.sId,
      ...opus46,
    });

    const result = await AdvancedModelResource.resolveAllowedAdvancedModels(
      userAuth,
      { user }
    );

    expect(result.models).toEqual([opus46]);
    expect(result.hasUserLevelOverride).toBe(true);
  });

  it("marks hasUserLevelOverride when the user has direct grants", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await AdvancedModelResource.addUserAllowedAdvancedModel(adminAuth, {
      userId: user.sId,
      ...opus46,
    });

    const withOverride =
      await AdvancedModelResource.resolveAllowedAdvancedModels(userAuth, {
        user,
      });

    await AdvancedModelResource.removeUserAllowedAdvancedModel(adminAuth, {
      userId: user.sId,
      ...opus46,
    });

    const withoutOverride =
      await AdvancedModelResource.resolveAllowedAdvancedModels(userAuth, {
        user,
      });

    expect(withOverride.hasUserLevelOverride).toBe(true);
    expect(withoutOverride.hasUserLevelOverride).toBe(false);
  });

  it("uses explicit groupModelIds instead of the user's groups when provided", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const memberGroup = await GroupFactory.regular(workspace, "Member group");
    const otherGroup = await GroupFactory.regular(workspace, "Other group");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await GroupFactory.withMembers(adminAuth, memberGroup, [user]);

    await restrictWorkspaceAdvancedModels(adminAuth, [opus47]);
    await AdvancedModelResource.addGroupAllowedAdvancedModel(adminAuth, {
      groupId: makeSId("group", {
        id: memberGroup.id,
        workspaceId: workspace.id,
      }),
      ...opus46,
    });
    await AdvancedModelResource.addGroupAllowedAdvancedModel(adminAuth, {
      groupId: makeSId("group", {
        id: otherGroup.id,
        workspaceId: workspace.id,
      }),
      ...opus47,
    });

    const result = await AdvancedModelResource.resolveAllowedAdvancedModels(
      userAuth,
      {
        user,
        groupModelIds: [otherGroup.id],
      }
    );

    expect(result.models).toEqual([opus47]);
    expect(result.hasUserLevelOverride).toBe(false);
  });

  it("does not require admin permissions", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result =
      await AdvancedModelResource.resolveAllowedAdvancedModels(userAuth);

    expect(result.models).toEqual(
      AdvancedModelResource.getAdvancedModels().map((model) => ({
        providerId: model.providerId,
        modelId: model.modelId,
      }))
    );
    expect(result.hasUserLevelOverride).toBe(false);
  });
});
