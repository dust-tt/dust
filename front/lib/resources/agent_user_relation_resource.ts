import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { isNumber } from "@app/types/shared/utils/general";
import assert from "assert";
import chunk from "lodash/chunk";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentUserRelationResource
  extends ReadonlyAttributesType<AgentUserRelationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentUserRelationResource extends BaseResource<AgentUserRelationModel> {
  static model: ModelStaticWorkspaceAware<AgentUserRelationModel> =
    AgentUserRelationModel;

  static async getFavoriteStates(
    auth: Authenticator,
    { configurationIds }: { configurationIds: string[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Map<string, boolean>> {
    const user = auth.getNonNullableUser();
    if (configurationIds.length === 0) {
      return new Map();
    }
    const relations = await this.model.findAll({
      attributes: ["agentConfiguration", "favorite"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfiguration: configurationIds,
        userId: user.id,
      },
      transaction,
    });
    return new Map(
      relations.map((relation) => [
        relation.agentConfiguration,
        relation.favorite,
      ])
    );
  }

  static async setFavorite(
    auth: Authenticator,
    { agentId, favorite }: { agentId: string; favorite: boolean },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.upsert(
      {
        userId: auth.getNonNullableUser().id,
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfiguration: agentId,
        favorite,
      },
      { transaction }
    );
    await AgentSearchIndexationResource.launch(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentIds: [agentId] },
      { transaction }
    );
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security;performance] backfill-agent-favorites
   * Admin backfills create only missing preferences for current workspace members and
   * existing workspace or code-defined agents; existing false preferences are preserved,
   * dry runs never write, and custom-agent indexation occurs after commit without DB N+1.
   */
  static async addMissingFavoritesForWorkspaceMembers(
    auth: Authenticator,
    { agentIds, dryRun = false }: { agentIds: string[]; dryRun?: boolean }
  ): Promise<{ memberCount: number; createdCount: number }> {
    assert(auth.isAdmin(), "Only admins can backfill agent favorites.");
    const workspace = auth.getNonNullableWorkspace();
    const ids = [...new Set(agentIds)];
    const result = await withTransaction(async (transaction) => {
      const customAgentIds = ids.filter((id) => !isGlobalAgentId(id));
      const agents =
        customAgentIds.length > 0
          ? await AgentConfigurationModel.findAll({
              attributes: ["sId"],
              where: { workspaceId: workspace.id, sId: customAgentIds },
              group: ["sId"],
              transaction,
            })
          : [];
      const knownIds = new Set(agents.map((agent) => agent.sId));
      assert(
        customAgentIds.every((id) => knownIds.has(id)),
        "Agent configuration not found in workspace."
      );
      const { memberships } = await MembershipResource.getActiveMemberships({
        workspace,
        transaction,
      });
      const userIds = [
        ...new Set(memberships.map((membership) => membership.userId)),
      ];
      if (dryRun || ids.length === 0 || userIds.length === 0) {
        return { memberCount: userIds.length, createdCount: 0 };
      }
      let createdCount = 0;
      // A preference per member/agent pair is required. Bound memory and SQL payloads to
      // 1,000 rows per insert, with no per-member or per-agent lookup inside these batches.
      for (const agentBatch of chunk(ids, 1_000)) {
        const memberBatchSize = Math.max(
          1,
          Math.floor(1_000 / agentBatch.length)
        );
        for (const memberBatch of chunk(userIds, memberBatchSize)) {
          const created = await this.model.bulkCreate(
            memberBatch.flatMap((userId) =>
              agentBatch.map((agentId) => ({
                workspaceId: workspace.id,
                userId,
                agentConfiguration: agentId,
                favorite: true,
              }))
            ),
            { ignoreDuplicates: true, returning: ["id"], transaction }
          );
          // Sequelize retains an unsaved instance for inputs ignored by ON CONFLICT.
          createdCount += created.filter((relation) =>
            isNumber(relation.id)
          ).length;
        }
      }
      return { memberCount: userIds.length, createdCount };
    });
    if (!dryRun) {
      // Retry also repairs an earlier committed backfill whose enqueue was lost.
      await AgentSearchIndexationResource.launch({
        workspaceId: workspace.sId,
        agentIds: ids,
      });
    }
    return result;
  }

  // Workspace scrubbing removes the workspace's entire search index separately.
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
  }

  constructor(
    model: ModelStaticWorkspaceAware<AgentUserRelationModel>,
    blob: Attributes<AgentUserRelationModel>
  ) {
    super(model, blob);
  }

  static async deleteForAgent(
    auth: Authenticator,
    agentId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.destroy({
      where: {
        agentConfiguration: agentId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    await AgentSearchIndexationResource.launch(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentIds: [agentId] },
      { transaction }
    );
  }

  static async deleteForAgents(
    agentIds: string[],
    {
      workspaceId,
      transaction,
    }: { workspaceId: ModelId; transaction?: Transaction }
  ): Promise<void> {
    if (agentIds.length === 0) {
      return;
    }
    await this.model.destroy({
      where: {
        agentConfiguration: agentIds,
        workspaceId,
      },
      transaction,
    });
    await AgentSearchIndexationResource.launchForWorkspaceModelId(
      { workspaceModelId: workspaceId, agentIds },
      { transaction }
    );
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend] merge-agent-favorites
   * User-relation merges are workspace-scoped and atomic, preserving the primary user's
   * existing preferences; affected logical agents are reindexed only after the outer commit.
   */
  static async migrateUserRelations(
    auth: Authenticator,
    {
      primaryUser,
      secondaryUser,
    }: { primaryUser: UserResource; secondaryUser: UserResource },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(primaryUser.id !== secondaryUser.id);
    const workspace = auth.getNonNullableWorkspace();
    const agentIds = await withTransaction(async (t) => {
      // Retain primary targets too so retrying a committed merge can repair a lost enqueue.
      const relations = await this.model.findAll({
        attributes: ["userId", "agentConfiguration"],
        where: {
          workspaceId: workspace.id,
          userId: [primaryUser.id, secondaryUser.id],
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const primaryAgentIds = relations
        .filter((relation) => relation.userId === primaryUser.id)
        .map((relation) => relation.agentConfiguration);
      await this.model.destroy({
        where: {
          workspaceId: workspace.id,
          userId: secondaryUser.id,
          agentConfiguration: primaryAgentIds,
        },
        transaction: t,
      });
      await this.model.update(
        { userId: primaryUser.id },
        {
          where: { workspaceId: workspace.id, userId: secondaryUser.id },
          transaction: t,
        }
      );
      return [
        ...new Set(relations.map((relation) => relation.agentConfiguration)),
      ];
    }, transaction);
    await AgentSearchIndexationResource.launch(
      { workspaceId: workspace.sId, agentIds },
      { transaction }
    );
  }

  static async countForAgent(
    auth: Authenticator,
    agentId: string
  ): Promise<number> {
    return this.model.count({
      where: {
        agentConfiguration: agentId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    assert(this.workspaceId === auth.getNonNullableWorkspace().id);
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    await AgentSearchIndexationResource.launch(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentIds: [this.agentConfiguration],
      },
      { transaction }
    );

    return new Ok(undefined);
  }
}
