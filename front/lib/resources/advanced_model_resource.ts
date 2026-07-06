import {
  advancedModelKey,
  type ResolvedAllowedAdvancedModels,
  resolveAllowedAdvancedModels,
} from "@app/lib/advanced_models/resolve_allowed";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { isAdvancedModel as isAdvancedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import {
  GroupAllowedAdvancedModel,
  UserAllowedAdvancedModel,
  WorkspaceAllowedAdvancedModel,
} from "@app/lib/models/allowed_advanced_model";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AllowedAdvancedModelType,
  GroupAllowedAdvancedModelsType,
  UserAllowedAdvancedModelsType,
} from "@app/types/api/advanced_models";
import {
  isModelId,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types/assistant/models/models";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  SupportedModel,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import { Op } from "sequelize";

export class AdvancedModelResource {
  private static assertIsAdmin(auth: Authenticator): void {
    assert(auth.isAdmin(), "Only admins can manage allowed advanced models.");
  }

  static isAdvancedModel(m: ModelConfigurationType): boolean {
    return isAdvancedModelConfig(m);
  }

  static getAdvancedModels(): ModelConfigurationType[] {
    return SUPPORTED_MODEL_CONFIGS.filter(isAdvancedModelConfig);
  }

  private static validateAdvancedModel({
    providerId,
    modelId,
  }: SupportedModel): Result<
    ModelConfigurationType,
    DustError<"invalid_request_error">
  > {
    const modelConfig = getSupportedModelConfig({ providerId, modelId });
    if (!modelConfig || !this.isAdvancedModel(modelConfig)) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "Model is not an advanced model."
        )
      );
    }

    return new Ok(modelConfig);
  }

  private static parseAllowedAdvancedModelRow({
    providerId,
    modelId,
  }: {
    providerId: string;
    modelId: string;
  }): AllowedAdvancedModelType | null {
    if (!isModelProviderId(providerId) || !isModelId(modelId)) {
      return null;
    }

    return { providerId, modelId };
  }

  static async addUserAllowedAdvancedModel(
    auth: Authenticator,
    { userId, providerId, modelId }: SupportedModel & { userId: string }
  ): Promise<
    Result<
      undefined,
      DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
    >
  > {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    const user = await UserResource.fetchById(userId);
    if (!user) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    if (!membership) {
      return new Err(
        new DustError(
          "user_not_member",
          "User is not an active member of the workspace."
        )
      );
    }

    await UserAllowedAdvancedModel.findOrCreate({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
        providerId: modelRes.value.providerId,
        modelId: modelRes.value.modelId,
      },
    });

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "user",
      enabled: true,
      model: modelRes.value,
      user,
    });

    return new Ok(undefined);
  }

  static async removeUserAllowedAdvancedModel(
    auth: Authenticator,
    { userId, providerId, modelId }: SupportedModel & { userId: string }
  ): Promise<
    Result<
      undefined,
      DustError<"invalid_request_error" | "user_not_found" | "user_not_member">
    >
  > {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    const user = await UserResource.fetchById(userId);
    if (!user) {
      return new Err(new DustError("user_not_found", "User not found."));
    }

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    if (!membership) {
      return new Err(
        new DustError(
          "user_not_member",
          "User is not an active member of the workspace."
        )
      );
    }

    await UserAllowedAdvancedModel.destroy({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
        providerId: modelRes.value.providerId,
        modelId: modelRes.value.modelId,
      },
    });

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "user",
      enabled: false,
      model: modelRes.value,
      user,
    });

    return new Ok(undefined);
  }

  static async addGroupAllowedAdvancedModel(
    auth: Authenticator,
    { groupId, providerId, modelId }: SupportedModel & { groupId: string }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "invalid_request_error"
        | "group_not_found"
        | "invalid_id"
        | "unauthorized"
      >
    >
  > {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    await GroupAllowedAdvancedModel.findOrCreate({
      where: {
        workspaceId: workspace.id,
        groupId: groupRes.value.id,
        providerId: modelRes.value.providerId,
        modelId: modelRes.value.modelId,
      },
    });

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "group",
      enabled: true,
      model: modelRes.value,
      group: groupRes.value,
    });

    return new Ok(undefined);
  }

  static async removeGroupAllowedAdvancedModel(
    auth: Authenticator,
    { groupId, providerId, modelId }: SupportedModel & { groupId: string }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "invalid_request_error"
        | "group_not_found"
        | "invalid_id"
        | "unauthorized"
      >
    >
  > {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const groupRes = await GroupResource.fetchById(auth, groupId);
    if (groupRes.isErr()) {
      return groupRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    await GroupAllowedAdvancedModel.destroy({
      where: {
        workspaceId: workspace.id,
        groupId: groupRes.value.id,
        providerId: modelRes.value.providerId,
        modelId: modelRes.value.modelId,
      },
    });

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "group",
      enabled: false,
      model: modelRes.value,
      group: groupRes.value,
    });

    return new Ok(undefined);
  }

  static async addWorkspaceAllowedAdvancedModel(
    auth: Authenticator,
    { providerId, modelId }: SupportedModel
  ): Promise<Result<undefined, DustError<"invalid_request_error">>> {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    const existingRow = await WorkspaceAllowedAdvancedModel.findOne({
      where: {
        workspaceId: workspace.id,
        providerId: modelRes.value.providerId,
        modelId: modelRes.value.modelId,
      },
    });

    if (!existingRow || existingRow.enabled) {
      return new Ok(undefined);
    }

    await existingRow.destroy();

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "workspace",
      enabled: true,
      model: modelRes.value,
    });

    return new Ok(undefined);
  }

  static async removeWorkspaceAllowedAdvancedModel(
    auth: Authenticator,
    { providerId, modelId }: SupportedModel
  ): Promise<Result<undefined, DustError<"invalid_request_error">>> {
    this.assertIsAdmin(auth);

    const modelRes = this.validateAdvancedModel({ providerId, modelId });
    if (modelRes.isErr()) {
      return modelRes;
    }

    const workspace = auth.getNonNullableWorkspace();
    const [existingRow, created] =
      await WorkspaceAllowedAdvancedModel.findOrCreate({
        where: {
          workspaceId: workspace.id,
          providerId: modelRes.value.providerId,
          modelId: modelRes.value.modelId,
        },
        defaults: {
          providerId: modelRes.value.providerId,
          modelId: modelRes.value.modelId,
          enabled: false,
        },
      });

    if (!created && !existingRow.enabled) {
      return new Ok(undefined);
    }

    await existingRow.update({ enabled: false });

    this.emitAdvancedModelAccessUpdatedAuditLog({
      auth,
      scope: "workspace",
      enabled: false,
      model: modelRes.value,
    });

    return new Ok(undefined);
  }

  static async listUserAllowedAdvancedModels(
    auth: Authenticator
  ): Promise<UserAllowedAdvancedModelsType[]> {
    this.assertIsAdmin(auth);

    const workspace = auth.getNonNullableWorkspace();
    const rows = await UserAllowedAdvancedModel.findAll({
      where: { workspaceId: workspace.id },
    });

    if (rows.length === 0) {
      return [];
    }

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = await UserResource.fetchByModelIds(userIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    const modelsByUserId = new Map<ModelId, AllowedAdvancedModelType[]>();
    for (const row of rows) {
      const model = this.parseAllowedAdvancedModelRow(row);
      if (!model) {
        continue;
      }

      const models = modelsByUserId.get(row.userId) ?? [];
      models.push(model);
      modelsByUserId.set(row.userId, models);
    }

    return userIds.flatMap((userModelId) => {
      const user = userById.get(userModelId);
      if (!user) {
        return [];
      }

      return [
        {
          userId: user.sId,
          models: modelsByUserId.get(userModelId) ?? [],
        },
      ];
    });
  }

  static async listGroupAllowedAdvancedModels(
    auth: Authenticator
  ): Promise<GroupAllowedAdvancedModelsType[]> {
    this.assertIsAdmin(auth);

    const workspace = auth.getNonNullableWorkspace();
    const rows = await GroupAllowedAdvancedModel.findAll({
      where: { workspaceId: workspace.id },
    });

    if (rows.length === 0) {
      return [];
    }

    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const groups = await GroupResource.fetchByModelIds(auth, groupIds);
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const modelsByGroupId = new Map<ModelId, AllowedAdvancedModelType[]>();
    for (const row of rows) {
      const model = this.parseAllowedAdvancedModelRow(row);
      if (!model) {
        continue;
      }

      const models = modelsByGroupId.get(row.groupId) ?? [];
      models.push(model);
      modelsByGroupId.set(row.groupId, models);
    }

    return groupIds.flatMap((groupModelId) => {
      const group = groupById.get(groupModelId);
      if (!group) {
        return [];
      }

      return [
        {
          groupId: makeSId("group", {
            id: group.id,
            workspaceId: workspace.id,
          }),
          models: modelsByGroupId.get(groupModelId) ?? [],
        },
      ];
    });
  }

  static async listWorkspaceAllowedAdvancedModels(
    auth: Authenticator
  ): Promise<AllowedAdvancedModelType[]> {
    this.assertIsAdmin(auth);

    const workspace = auth.getNonNullableWorkspace();
    return this.loadWorkspaceAllowedAdvancedModels(workspace.id);
  }

  static async resolveAllowedAdvancedModels(
    auth: Authenticator,
    {
      user,
      groupModelIds: explicitGroupModelIds,
    }: {
      user?: UserResource | null;
      groupModelIds?: ModelId[];
    } = {}
  ): Promise<ResolvedAllowedAdvancedModels> {
    const workspace = auth.getNonNullableWorkspace();

    let groupModelIds = explicitGroupModelIds;
    if (groupModelIds === undefined && user) {
      groupModelIds = await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace,
      });
    }
    groupModelIds = groupModelIds ?? [];

    const [workspaceAllowedAdvancedModels, groupModelsByGroupId, userModels] =
      await Promise.all([
        this.loadWorkspaceAllowedAdvancedModels(workspace.id),
        groupModelIds.length > 0
          ? this.loadGroupAllowedAdvancedModelsByGroupId({
              workspaceId: workspace.id,
              groupModelIds,
            })
          : Promise.resolve(new Map<ModelId, AllowedAdvancedModelType[]>()),
        user
          ? this.loadUserAllowedAdvancedModels({
              workspaceId: workspace.id,
              userModelId: user.id,
            })
          : Promise.resolve([]),
      ]);

    const groupAllowedAdvancedModelsList = groupModelIds.map(
      (groupModelId) => groupModelsByGroupId.get(groupModelId) ?? []
    );

    return resolveAllowedAdvancedModels({
      workspaceAllowedAdvancedModels,
      groupAllowedAdvancedModelsList,
      userAllowedAdvancedModels: userModels,
    });
  }

  private static getDefaultWorkspaceAllowedAdvancedModels(): AllowedAdvancedModelType[] {
    return this.getAdvancedModels().map(({ providerId, modelId }) => ({
      providerId,
      modelId,
    }));
  }

  private static emitAdvancedModelAccessUpdatedAuditLog({
    auth,
    scope,
    enabled,
    model,
    user,
    group,
  }: {
    auth: Authenticator;
    scope: "workspace" | "user" | "group";
    enabled: boolean;
    model: ModelConfigurationType;
    user?: UserResource;
    group?: GroupResource;
  }): void {
    const workspace = auth.getNonNullableWorkspace();
    const metadata = {
      provider_id: model.providerId,
      model_id: model.modelId,
      enabled: enabled ? "true" : "false",
    };

    switch (scope) {
      case "workspace":
        void emitAuditLogEvent({
          auth,
          action: "workspace.advanced_model_access_updated",
          targets: [buildAuditLogTarget("workspace", workspace)],
          metadata,
        });
        break;
      case "user":
        assert(user);
        void emitAuditLogEvent({
          auth,
          action: "user.advanced_model_access_updated",
          targets: [
            buildAuditLogTarget("workspace", workspace),
            buildAuditLogTarget("user", {
              sId: user.sId,
              name: user.fullName() ?? "unknown",
            }),
          ],
          metadata,
        });
        break;
      case "group":
        assert(group);
        void emitAuditLogEvent({
          auth,
          action: "group.advanced_model_access_updated",
          targets: [
            buildAuditLogTarget("workspace", workspace),
            buildAuditLogTarget("group", {
              sId: group.sId,
              name: group.name,
            }),
          ],
          metadata,
        });
        break;
      default:
        assertNever(scope);
    }
  }

  private static async loadWorkspaceAllowedAdvancedModels(
    workspaceId: ModelId
  ): Promise<AllowedAdvancedModelType[]> {
    const rows = await WorkspaceAllowedAdvancedModel.findAll({
      where: { workspaceId },
    });

    if (rows.length === 0) {
      return this.getDefaultWorkspaceAllowedAdvancedModels();
    }

    const disabledModelKeys = new Set<string>();
    for (const row of rows) {
      if (row.enabled) {
        continue;
      }

      const model = this.parseAllowedAdvancedModelRow(row);
      if (model) {
        disabledModelKeys.add(advancedModelKey(model));
      }
    }

    return this.getAdvancedModels()
      .filter((model) => !disabledModelKeys.has(advancedModelKey(model)))
      .map(({ providerId, modelId }) => ({
        providerId,
        modelId,
      }));
  }

  private static async loadGroupAllowedAdvancedModelsByGroupId({
    workspaceId,
    groupModelIds,
  }: {
    workspaceId: ModelId;
    groupModelIds: ModelId[];
  }): Promise<Map<ModelId, AllowedAdvancedModelType[]>> {
    const rows = await GroupAllowedAdvancedModel.findAll({
      where: {
        workspaceId,
        groupId: {
          [Op.in]: groupModelIds,
        },
      },
    });

    const modelsByGroupId = new Map<ModelId, AllowedAdvancedModelType[]>();
    for (const row of rows) {
      const model = this.parseAllowedAdvancedModelRow(row);
      if (!model) {
        continue;
      }

      const models = modelsByGroupId.get(row.groupId) ?? [];
      models.push(model);
      modelsByGroupId.set(row.groupId, models);
    }

    return modelsByGroupId;
  }

  private static async loadUserAllowedAdvancedModels({
    workspaceId,
    userModelId,
  }: {
    workspaceId: ModelId;
    userModelId: ModelId;
  }): Promise<AllowedAdvancedModelType[]> {
    const rows = await UserAllowedAdvancedModel.findAll({
      where: {
        workspaceId,
        userId: userModelId,
      },
    });

    return rows.flatMap((row) => {
      const model = this.parseAllowedAdvancedModelRow(row);
      return model ? [model] : [];
    });
  }
}
