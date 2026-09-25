import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BatchSuggestionModel } from "@app/lib/models/batch_suggestion";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  BatchSuggestionState,
  BatchSuggestionType,
  LightBatchSuggestionType,
} from "@app/types/suggestions/batch_suggestion";
import groupBy from "lodash/groupBy";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BatchSuggestionResource
  extends ReadonlyAttributesType<BatchSuggestionModel> {}

/**
 * A batch groups agent and skill suggestions that are reviewed together. The batch carries no
 * permission of its own: access derives from its members, see `fetchByIds`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BatchSuggestionResource extends BaseResource<BatchSuggestionModel> {
  static model: ModelStaticWorkspaceAware<BatchSuggestionModel> =
    BatchSuggestionModel;

  readonly agentSuggestions: AgentSuggestionResource[];
  readonly skillSuggestions: SkillSuggestionResource[];
  readonly sourceConversationId: string | null;

  constructor(
    model: ModelStaticWorkspaceAware<BatchSuggestionModel>,
    blob: Attributes<BatchSuggestionModel>,
    {
      agentSuggestions,
      skillSuggestions,
      sourceConversationId,
    }: {
      agentSuggestions: AgentSuggestionResource[];
      skillSuggestions: SkillSuggestionResource[];
      sourceConversationId: string | null;
    }
  ) {
    super(BatchSuggestionModel, blob);
    this.agentSuggestions = agentSuggestions;
    this.skillSuggestions = skillSuggestions;
    this.sourceConversationId = sourceConversationId;
  }

  /**
   * Creates an empty batch. Members are attached by creating agent or skill suggestions with its
   * `id` as `batchId`.
   */
  static async makeNew(
    auth: Authenticator,
    {
      sourceConversation,
      ...blob
    }: Omit<
      CreationAttributes<BatchSuggestionModel>,
      "workspaceId" | "sourceConversationModelId"
    > & {
      sourceConversation: { id: ModelId; sId: string } | null;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<BatchSuggestionResource> {
    const batch = await this.model.create(
      {
        ...blob,
        sourceConversationModelId: sourceConversation?.id ?? null,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(this.model, batch.get(), {
      agentSuggestions: [],
      skillSuggestions: [],
      sourceConversationId: sourceConversation?.sId ?? null,
    });
  }

  /**
   * @cc [owner:fabiencelier,label:security] batch-visible-only-with-all-members
   * A batch MUST only be returned when the caller can access every one of its agent and skill
   * suggestions (the members' own resources decide access): fetching a batch with a member the
   * caller cannot access MUST throw, so its title and analysis are never returned. A batch without
   * any member is not returned.
   */
  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<BatchSuggestionResource[]> {
    const batchModelIds = removeNulls(ids.map(getResourceIdFromSId));
    if (batchModelIds.length === 0) {
      return [];
    }

    const [batches, agentSuggestions, skillSuggestions] = await Promise.all([
      this.model.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: batchModelIds,
        },
        include: [
          {
            model: ConversationModel,
            as: "sourceConversation",
            required: false,
            attributes: ["sId"],
          },
        ],
      }),
      AgentSuggestionResource.listByBatchModelIds(auth, batchModelIds),
      SkillSuggestionResource.listByBatchModelIds(auth, batchModelIds),
    ]);

    const agentSuggestionsByBatchId = groupBy(
      agentSuggestions,
      (s) => s.batchId
    );
    const skillSuggestionsByBatchId = groupBy(
      skillSuggestions,
      (s) => s.batchId
    );

    return removeNulls(
      batches.map((batch) => {
        const batchAgentSuggestions = agentSuggestionsByBatchId[batch.id] ?? [];
        const batchSkillSuggestions = skillSuggestionsByBatchId[batch.id] ?? [];

        if (batchAgentSuggestions.length + batchSkillSuggestions.length === 0) {
          return null;
        }

        return new this(this.model, batch.get(), {
          agentSuggestions: batchAgentSuggestions,
          skillSuggestions: batchSkillSuggestions,
          sourceConversationId: batch.sourceConversation?.sId ?? null,
        });
      })
    );
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<BatchSuggestionResource | null> {
    const [batch] = await this.fetchByIds(auth, [id]);
    return batch ?? null;
  }

  /**
   * @cc [owner:fabiencelier,label:product] batch-state-propagates-to-members
   * Updating the state of a batch MUST set that same state on the batch and on every one of its
   * agent and skill suggestions, in a single transaction: either all of them change or none does.
   * Agents and skills suggestions belonging to a batch must never have their state updated individually.
   */
  async updateState(
    auth: Authenticator,
    state: BatchSuggestionState,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    if (this.workspaceId !== workspaceId) {
      throw new Error("Can't update a batch suggestion of another workspace.");
    }

    await withTransaction(async (t) => {
      await this.update({ state }, t, { workspaceId });
      await AgentSuggestionResource.updateStateOfBatchMembers(
        auth,
        [this.id],
        state,
        { transaction: t }
      );
      await SkillSuggestionResource.updateStateOfBatchMembers(
        auth,
        [this.id],
        state,
        { transaction: t }
      );
    }, transaction);
  }

  /**
   * @cc [owner:fabiencelier,label:product] batch-outdated-as-a-whole
   * When suggestions are outdated, every batch they belong to MUST be marked `outdated` together
   * with all its members, in a single transaction.
   */
  static async outdateBatchesOf(
    auth: Authenticator,
    batchModelIds: ModelId[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (batchModelIds.length === 0) {
      return;
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await withTransaction(async (t) => {
      await this.model.update(
        { state: "outdated" },
        {
          where: { workspaceId, id: batchModelIds },
          transaction: t,
        }
      );
      await AgentSuggestionResource.updateStateOfBatchMembers(
        auth,
        batchModelIds,
        "outdated",
        { transaction: t }
      );
      await SkillSuggestionResource.updateStateOfBatchMembers(
        auth,
        batchModelIds,
        "outdated",
        { transaction: t }
      );
    }, transaction);
  }

  /**
   * Deletes the batch row only: its members reference it (`RESTRICT`), so they must be deleted or
   * detached first.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  /**
   * WARNING: This method deletes ALL batches for a workspace. Agent and skill suggestions of the
   * workspace must be deleted first. Intended for workspace deletion workflows only.
   */
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (!auth.isAdmin()) {
      throw new Error("Only workspace admins can delete all batch suggestions");
    }

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  get sId(): string {
    return BatchSuggestionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("batch_suggestion", {
      id,
      workspaceId,
    });
  }

  toJSON(): LightBatchSuggestionType {
    return {
      id: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      title: this.title,
      analysis: this.analysis,
      state: this.state,
      sourceConversationId: this.sourceConversationId,
      agentSuggestionIds: this.agentSuggestions.map((s) => s.sId),
      skillSuggestionIds: this.skillSuggestions.map((s) => s.sId),
    };
  }

  toJSONWithSuggestions(): BatchSuggestionType {
    return {
      id: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      title: this.title,
      analysis: this.analysis,
      state: this.state,
      sourceConversationId: this.sourceConversationId,
      agentSuggestions: this.agentSuggestions.map((s) => s.toJSON()),
      skillSuggestions: this.skillSuggestions.map((s) => s.toJSON()),
    };
  }
}
