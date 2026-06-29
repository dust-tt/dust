import { isModelTier, type ModelTier } from "@app/lib/api/models_picker/tiers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModelTierModel } from "@app/lib/resources/storage/models/group_model_tier";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserModelTierModel } from "@app/lib/resources/storage/models/user_model_tier";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";

const ADMIN_ONLY_ERROR = "Only admins can manage model tiers.";

/**
 * Facade over workspace, user, and group model tier configuration.
 *
 * - Workspace: stored on `workspaces.defaultModelsTier` (null = platform default).
 * - User / group: sparse override rows in `user_model_tiers` / `group_model_tiers`.
 */
export class ModelTierResource {
  static async getWorkspaceTier(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ModelTier | null> {
    const workspace = auth.getNonNullableWorkspace();
    const workspaceResource = await WorkspaceResource.fetchById(
      workspace.sId,
      transaction
    );
    return workspaceResource?.defaultModelsTier ?? null;
  }

  static async setWorkspaceTier(
    auth: Authenticator,
    {
      tier,
      transaction,
    }: {
      tier: ModelTier;
      transaction?: Transaction;
    }
  ): Promise<Result<void, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    if (!isModelTier(tier)) {
      return new Err(new Error(`Invalid model tier: ${tier}`));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId,
        transaction
      );
      if (!workspaceResource) {
        return new Err(new Error(`Workspace not found: ${workspace.sId}`));
      }

      await workspaceResource.updateWorkspaceSettings(
        { defaultModelsTier: tier },
        transaction
      );
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async clearWorkspaceTier(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<boolean, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId,
        transaction
      );
      if (!workspaceResource) {
        return new Err(new Error(`Workspace not found: ${workspace.sId}`));
      }

      if (workspaceResource.defaultModelsTier === null) {
        return new Ok(false);
      }

      await workspaceResource.updateWorkspaceSettings(
        { defaultModelsTier: null },
        transaction
      );
      return new Ok(true);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async listUserTiers(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Record<string, ModelTier>> {
    const workspace = auth.getNonNullableWorkspace();
    const rows = await UserModelTierModel.findAll({
      where: { workspaceId: workspace.id },
      transaction,
    });
    if (rows.length === 0) {
      return {};
    }

    const users = await UserModel.findAll({
      where: { id: rows.map((row) => row.userId) },
      attributes: ["id", "sId"],
      transaction,
    });
    const sIdByUserId = new Map(users.map((user) => [user.id, user.sId]));

    const tiers: Record<string, ModelTier> = {};
    for (const row of rows) {
      const sId = sIdByUserId.get(row.userId);
      if (sId) {
        tiers[sId] = row.tier;
      }
    }
    return tiers;
  }

  static async getUserTier(
    auth: Authenticator,
    {
      userId,
      transaction,
    }: {
      userId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<ModelTier | null> {
    const workspace = auth.getNonNullableWorkspace();
    const row = await UserModelTierModel.findOne({
      where: { workspaceId: workspace.id, userId },
      transaction,
    });
    return row?.tier ?? null;
  }

  static async setUserTier(
    auth: Authenticator,
    {
      userId,
      tier,
      transaction,
    }: {
      userId: ModelId;
      tier: ModelTier;
      transaction?: Transaction;
    }
  ): Promise<Result<void, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    if (!isModelTier(tier)) {
      return new Err(new Error(`Invalid model tier: ${tier}`));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const existing = await UserModelTierModel.findOne({
        where: { workspaceId: workspace.id, userId },
        transaction,
      });
      if (existing) {
        await existing.update({ tier }, { transaction });
      } else {
        await UserModelTierModel.create(
          { workspaceId: workspace.id, userId, tier },
          { transaction }
        );
      }
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async clearUserTier(
    auth: Authenticator,
    {
      userId,
      transaction,
    }: {
      userId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<Result<boolean, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const deletedCount = await UserModelTierModel.destroy({
        where: { workspaceId: workspace.id, userId },
        transaction,
      });
      return new Ok(deletedCount > 0);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async listGroupTiers(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Record<string, ModelTier>> {
    const workspace = auth.getNonNullableWorkspace();
    const rows = await GroupModelTierModel.findAll({
      where: { workspaceId: workspace.id },
      transaction,
    });

    const tiers: Record<string, ModelTier> = {};
    for (const row of rows) {
      tiers[
        GroupResource.modelIdToSId({
          id: row.groupId,
          workspaceId: workspace.id,
        })
      ] = row.tier;
    }
    return tiers;
  }

  static async getGroupTier(
    auth: Authenticator,
    {
      groupId,
      transaction,
    }: {
      groupId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<ModelTier | null> {
    const workspace = auth.getNonNullableWorkspace();
    const row = await GroupModelTierModel.findOne({
      where: { workspaceId: workspace.id, groupId },
      transaction,
    });
    return row?.tier ?? null;
  }

  static async setGroupTier(
    auth: Authenticator,
    {
      groupId,
      tier,
      transaction,
    }: {
      groupId: ModelId;
      tier: ModelTier;
      transaction?: Transaction;
    }
  ): Promise<Result<void, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    if (!isModelTier(tier)) {
      return new Err(new Error(`Invalid model tier: ${tier}`));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const existing = await GroupModelTierModel.findOne({
        where: { workspaceId: workspace.id, groupId },
        transaction,
      });
      if (existing) {
        await existing.update({ tier }, { transaction });
      } else {
        await GroupModelTierModel.create(
          { workspaceId: workspace.id, groupId, tier },
          { transaction }
        );
      }
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async clearGroupTier(
    auth: Authenticator,
    {
      groupId,
      transaction,
    }: {
      groupId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<Result<boolean, Error>> {
    if (!auth.isAdmin()) {
      return new Err(new Error(ADMIN_ONLY_ERROR));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();
      const deletedCount = await GroupModelTierModel.destroy({
        where: { workspaceId: workspace.id, groupId },
        transaction,
      });
      return new Ok(deletedCount > 0);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
