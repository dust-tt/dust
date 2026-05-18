import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  ProjectTaskConversationModel,
  ProjectTaskModel,
  ProjectTaskSourceModel,
  ProjectTaskVersionModel,
} from "@app/lib/resources/storage/models/project_task";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ProjectTaskAssigneeType,
  ProjectTaskSourceInfo,
  ProjectTaskType,
} from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WhereOptions } from "sequelize";
import {
  type Attributes,
  type CreationAttributes,
  type ModelStatic,
  Op,
  type Transaction,
} from "sequelize";

// Return type of fetchByItemIds: outer key is itemId (action item sId), inner
// key is userId (ModelId | null, where null represents unassigned tasks).
export type TodosByItemId = Map<
  string,
  Map<ModelId | null, ProjectTaskResource[]>
>;
export type TasksByItemId = TodosByItemId;

type ProjectTaskVersionCreationAttributes =
  CreationAttributes<ProjectTaskModel> & {
    projectTodoId: ModelId;
    version: number;
  };

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectTaskResource
  extends ReadonlyAttributesType<ProjectTaskModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectTaskResource extends BaseResource<ProjectTaskModel> {
  static model: ModelStaticWorkspaceAware<ProjectTaskModel> = ProjectTaskModel;
  private readonly assignee: ProjectTaskAssigneeType | null;
  private readonly conversationSId: string | null;
  private readonly createdByUserSId: string | null;
  private readonly markedAsDoneByUserSId: string | null;

  constructor(
    model: ModelStatic<ProjectTaskModel>,
    blob: Attributes<ProjectTaskModel>,
    {
      assignee,
      conversationSId,
      createdByUserSId,
      markedAsDoneByUserSId,
    }: {
      assignee?: ProjectTaskAssigneeType | null;
      conversationSId?: string | null;
      createdByUserSId?: string | null;
      markedAsDoneByUserSId?: string | null;
    } = {}
  ) {
    super(ProjectTaskModel, blob);
    this.assignee = assignee ?? null;
    this.conversationSId = conversationSId ?? null;
    this.createdByUserSId = createdByUserSId ?? null;
    this.markedAsDoneByUserSId = markedAsDoneByUserSId ?? null;
  }

  // The stable string identifier for this todo, computed from the model's
  // integer id. External code must use this sId — never the raw model id.
  get sId(): string {
    return ProjectTaskResource.modelIdToSId({
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
    return makeSId("project_task", { id, workspaceId });
  }

  // ── Creation ────────────────────────────────────────────────────────────────

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<ProjectTaskModel>,
      "workspaceId" | "category"
    >,
    transaction?: Transaction
  ): Promise<ProjectTaskResource> {
    return withTransaction(async (t) => {
      const todo = await ProjectTaskModel.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
          category: "to_do",
        },
        { transaction: t }
      );

      return new this(ProjectTaskModel, todo.get());
    }, transaction);
  }

  // Snapshots the current mutable state into the version table, then updates
  // the main row in place. The version number is determined by the existing
  // snapshot count + 1.
  async updateWithVersion(
    auth: Authenticator,
    updates: Partial<
      Pick<
        CreationAttributes<ProjectTaskModel>,
        | "category"
        | "userId"
        | "text"
        | "status"
        | "doneAt"
        | "actorRationale"
        | "agentInstructions"
        | "markedAsDoneByType"
        | "markedAsDoneByUserId"
        | "markedAsDoneByAgentConfigurationId"
        | "deletedAt"
        | "agentSuggestionStatus"
        | "agentSuggestionReviewedAt"
        | "agentSuggestionReviewedByUserId"
      >
    >,
    transaction?: Transaction
  ): Promise<ProjectTaskResource> {
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      throw new Error("Workspace mismatch in updateWithVersion.");
    }

    return withTransaction(async (t) => {
      await this.saveVersion(t);
      await this.update(updates, t);

      return this;
    }, transaction);
  }

  // Saves the current mutable state as a version snapshot. Called before every
  // in-place update of the main row.
  private async saveVersion(transaction?: Transaction): Promise<void> {
    const where: WhereOptions<ProjectTaskVersionModel> = {
      workspaceId: this.workspaceId,
      projectTodoId: this.id,
    };

    const existingCount = await ProjectTaskVersionModel.count({
      where,
      transaction,
    });

    const versionData: ProjectTaskVersionCreationAttributes = {
      workspaceId: this.workspaceId,
      projectTodoId: this.id,
      version: existingCount + 1,
      spaceId: this.spaceId,
      userId: this.userId,
      createdByType: this.createdByType,
      createdByUserId: this.createdByUserId ?? null,
      createdByAgentConfigurationId: this.createdByAgentConfigurationId ?? null,
      category: this.category,
      text: this.text,
      status: this.status,
      doneAt: this.doneAt ?? null,
      actorRationale: this.actorRationale ?? null,
      agentInstructions: this.agentInstructions ?? null,
      markedAsDoneByType: this.markedAsDoneByType ?? null,
      markedAsDoneByUserId: this.markedAsDoneByUserId ?? null,
      markedAsDoneByAgentConfigurationId:
        this.markedAsDoneByAgentConfigurationId ?? null,
      deletedAt: this.deletedAt ?? null,
      agentSuggestionStatus: this.agentSuggestionStatus ?? null,
      agentSuggestionReviewedAt: this.agentSuggestionReviewedAt ?? null,
      agentSuggestionReviewedByUserId:
        this.agentSuggestionReviewedByUserId ?? null,
    };
    await ProjectTaskVersionModel.create(versionData, { transaction });
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ProjectTaskModel>,
    transaction?: Transaction
  ): Promise<ProjectTaskResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const todos = await ProjectTaskModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        deletedAt: null,
      },
      ...otherOptions,
      transaction,
    });

    if (todos.length === 0) {
      return [];
    }

    const todoModelIds = todos.map((todo) => todo.id);
    const assigneeModelIds = [
      ...new Set(
        todos
          .map((todo) => todo.userId)
          .filter((id): id is ModelId => id !== null)
      ),
    ];
    const actorModelIds = [
      ...new Set([
        ...todos
          .map((todo) => todo.createdByUserId)
          .filter((id): id is ModelId => id !== null),
        ...todos
          .map((todo) => todo.markedAsDoneByUserId)
          .filter((id): id is ModelId => id !== null),
      ]),
    ];
    const workspaceId = auth.getNonNullableWorkspace().id;

    const [assignees, actors, conversationRows] = await Promise.all([
      UserResource.fetchByModelIds(assigneeModelIds, { transaction }),
      UserResource.fetchByModelIds(actorModelIds, { transaction }),
      ProjectTaskConversationModel.findAll({
        where: {
          workspaceId,
          projectTodoId: { [Op.in]: todoModelIds },
        },
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            attributes: ["sId"],
            required: true,
          },
        ],
        order: [["createdAt", "DESC"]],
        transaction,
      }),
    ]);

    const assigneeByModelId = new Map<ModelId, ProjectTaskAssigneeType>(
      assignees.map((assignee) => [
        assignee.id,
        {
          sId: assignee.sId,
          fullName: assignee.fullName(),
          image: assignee.imageUrl,
        },
      ])
    );

    const actorSIdByModelId = new Map<ModelId, string>(
      actors.map((actor) => [actor.id, actor.sId])
    );

    const conversationIdByTodoModelId = new Map<ModelId, string>();
    for (const row of conversationRows) {
      const conversationId = row.conversation?.sId;
      if (
        !conversationId ||
        conversationIdByTodoModelId.has(row.projectTodoId)
      ) {
        continue;
      }
      conversationIdByTodoModelId.set(row.projectTodoId, conversationId);
    }

    return todos.map((todo) => {
      return new this(ProjectTaskModel, todo.get(), {
        assignee:
          (todo.userId !== null
            ? assigneeByModelId.get(todo.userId)
            : undefined) ?? null,
        conversationSId: conversationIdByTodoModelId.get(todo.id) ?? null,
        createdByUserSId:
          todo.createdByUserId !== null
            ? (actorSIdByModelId.get(todo.createdByUserId) ?? null)
            : null,
        markedAsDoneByUserSId:
          todo.markedAsDoneByUserId !== null
            ? (actorSIdByModelId.get(todo.markedAsDoneByUserId) ?? null)
            : null,
      });
    });
  }

  // Fetches a todo by its stable string sId, excluding soft-deleted rows.
  static async fetchBySId(
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTaskResource | null> {
    const id = getResourceIdFromSId(sId);
    if (id === null) {
      return null;
    }
    const results = await this.baseFetch(auth, { where: { id }, limit: 1 });
    return results[0] ?? null;
  }

  // Fetches a todo by its stable string sId, including soft-deleted rows.
  static async fetchBySIdWithDeleted(
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTaskResource | null> {
    const id = getResourceIdFromSId(sId);
    if (id === null) {
      return null;
    }

    const todo = await ProjectTaskModel.findOne({
      where: { id, workspaceId: auth.getNonNullableWorkspace().id },
    });

    return todo ? new this(ProjectTaskModel, todo.get()) : null;
  }

  // Fetches a todo by its numeric ModelId, including soft-deleted rows.
  static async fetchByModelIdWithDeleted(
    auth: Authenticator,
    id: ModelId
  ): Promise<ProjectTaskResource | null> {
    const todo = await ProjectTaskModel.findOne({
      where: { id, workspaceId: auth.getNonNullableWorkspace().id },
    });

    return todo ? new this(ProjectTaskModel, todo.get()) : null;
  }

  static async fetchBySpace(
    auth: Authenticator,
    {
      spaceId,
      timeScope,
      assigneeUserId = null,
    }: {
      spaceId: ModelId;
      timeScope: "active" | "last_24h" | "last_7d" | "last_30d" | "all";
      assigneeUserId?: ModelId | null;
    }
  ): Promise<ProjectTaskResource[]> {
    const MS_PER_HOUR = 60 * 60 * 1000;

    const cutoffFor = (scope: "last_24h" | "last_7d" | "last_30d"): Date => {
      const now = Date.now();
      switch (scope) {
        case "last_24h":
          return new Date(now - 24 * MS_PER_HOUR);
        case "last_7d":
          return new Date(now - 7 * 24 * MS_PER_HOUR);
        case "last_30d":
          return new Date(now - 30 * 24 * MS_PER_HOUR);
        default:
          return assertNever(scope);
      }
    };

    const clauses: WhereOptions<ProjectTaskModel>[] = [{ spaceId }];

    if (assigneeUserId != null) {
      clauses.push({ userId: assigneeUserId });
    }

    switch (timeScope) {
      case "active":
        clauses.push({ status: { [Op.ne]: "done" } });
        break;
      case "last_24h":
      case "last_7d":
      case "last_30d":
        clauses.push({ doneAt: { [Op.gte]: cutoffFor(timeScope) } });
        break;
      case "all":
        break;
      default:
        assertNever(timeScope);
    }

    const where: WhereOptions<ProjectTaskModel> =
      clauses.length === 1 ? clauses[0]! : { [Op.and]: clauses };

    return this.baseFetch(auth, { where, order: [["createdAt", "DESC"]] });
  }

  // Returns all todos for the authenticated user in the given space. Each row
  // in project_todos IS the latest state — no de-duplication needed.
  static async fetchLatestBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTaskResource[]> {
    return this.baseFetch(auth, {
      where: { spaceId, userId: auth.getNonNullableUser().id },
      order: [["createdAt", "DESC"]],
    });
  }

  // Fetches all todos for the given space across all users, including
  // soft-deleted rows. Used by the merge workflow for space-wide dedup.
  static async fetchAllBySpaceIncludingDeleted(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTaskResource[]> {
    const todos = await ProjectTaskModel.findAll({
      where: { workspaceId: auth.getNonNullableWorkspace().id, spaceId },
      order: [["createdAt", "DESC"]],
    });
    return todos.map((todo) => new this(ProjectTaskModel, todo.get()));
  }

  // Batch variant: fetches the current todo row for each itemId in one pass.
  // Returns a map from itemId to the matching ProjectTaskResource — missing
  // entries mean no todo yet exists for that item.
  static async fetchByItemIds(
    auth: Authenticator,
    { itemIds }: { itemIds: string[] }
  ): Promise<TodosByItemId> {
    if (itemIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const sources = await ProjectTaskSourceModel.findAll({
      where: { workspaceId, itemId: { [Op.in]: itemIds } },
    });
    if (sources.length === 0) {
      return new Map();
    }

    const linkedModelIds = [...new Set(sources.map((s) => s.projectTodoId))];
    const linkedRows = await this.baseFetch(auth, {
      where: { id: { [Op.in]: linkedModelIds } },
    });
    if (linkedRows.length === 0) {
      return new Map();
    }

    const rowById = new Map<ModelId, ProjectTaskResource>(
      linkedRows.map((t) => [t.id, t])
    );

    const result: TasksByItemId = new Map();
    for (const source of sources) {
      const todo = rowById.get(source.projectTodoId);
      if (!todo) {
        continue;
      }
      const byUser =
        result.get(source.itemId) ??
        new Map<ModelId | null, ProjectTaskResource[]>();
      const userId = todo.userId;
      byUser.set(userId, [...(byUser.get(userId) ?? []), todo]);
      result.set(source.itemId, byUser);
    }

    return result;
  }

  // Returns all source entries grouped by logical todo sId. Because sources are
  // linked to specific version rows, this queries across ALL versions for the
  // given set of logical todo sIds and deduplicates by (sId, sourceType, sourceId).
  static async fetchSourcesForTaskIds(
    auth: Authenticator,
    { sIds }: { sIds: string[] }
  ): Promise<Map<string, Array<ProjectTaskSourceInfo>>> {
    if (sIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    // Decode each sId to its integer model id.
    const idToSId = new Map<number, string>();
    for (const sId of sIds) {
      const id = getResourceIdFromSId(sId);
      if (id !== null) {
        idToSId.set(id, sId);
      }
    }

    if (idToSId.size === 0) {
      return new Map();
    }

    // Fetch sources for all logical todos in a single query.
    const sources = await ProjectTaskSourceModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: [...idToSId.keys()] },
      },
    });

    // Group by logical todo sId.
    const result = new Map<string, Array<ProjectTaskSourceInfo>>();

    for (const source of sources) {
      const todoId = idToSId.get(source.projectTodoId);
      if (!todoId) {
        continue;
      }

      const existing = result.get(todoId) ?? [];
      existing.push({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourceTitle: source.sourceTitle,
        sourceUrl: source.sourceUrl,
      });
      result.set(todoId, existing);
    }

    return result;
  }

  static async fetchConversationIdsForTaskIds(
    auth: Authenticator,
    { sIds }: { sIds: string[] }
  ): Promise<Map<string, string>> {
    if (sIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const idToSId = new Map<number, string>();
    for (const sId of sIds) {
      const id = getResourceIdFromSId(sId);
      if (id !== null) {
        idToSId.set(id, sId);
      }
    }

    if (idToSId.size === 0) {
      return new Map();
    }

    const rows = await ProjectTaskConversationModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: [...idToSId.keys()] },
      },
      include: [
        {
          model: ConversationModel,
          as: "conversation",
          attributes: ["sId"],
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const result = new Map<string, string>();
    for (const row of rows) {
      const todoSId = idToSId.get(row.projectTodoId);
      const conversationSId = row.conversation?.sId;
      if (!todoSId || !conversationSId || result.has(todoSId)) {
        continue;
      }
      result.set(todoSId, conversationSId);
    }

    return result;
  }

  async getLatestConversationId(auth: Authenticator): Promise<string | null> {
    const conversationIds =
      await ProjectTaskResource.fetchConversationIdsForTaskIds(auth, {
        sIds: [this.sId],
      });
    return conversationIds.get(this.sId) ?? null;
  }

  async addConversation(
    auth: Authenticator,
    { conversationModelId }: { conversationModelId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTaskConversationModel.findOrCreate({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        conversationId: conversationModelId,
      },
      defaults: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        conversationId: conversationModelId,
      },
      transaction,
    });
  }

  // ── Source links (* => todo) ─────────────────────────────────────────────

  // Links the given takeaway item + source document to this todo. Idempotent
  // by (workspaceId, itemId): if a row already exists for this itemId its
  // title and URL are updated so Temporal activity retries converge instead
  // of creating a duplicate.
  async upsertSource(
    auth: Authenticator,
    {
      itemId,
      source,
    }: {
      itemId: string;
      source: ProjectTaskSourceInfo;
    },
    transaction?: Transaction
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    // we want one link between one given TODO for a given source
    const identity = {
      workspaceId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      projectTodoId: this.id,
    };
    const payload = {
      itemId, // we can have multiple items from the same source
      sourceTitle: source.sourceTitle, // we update to the latest title
      sourceUrl: source.sourceUrl, // same here
    };

    const [sourceInstance, created] = await ProjectTaskSourceModel.findOrCreate(
      {
        where: identity,
        defaults: { ...identity, ...payload },
        transaction,
      }
    );
    if (!created) {
      await sourceInstance.update(payload, { transaction });
    }
  }

  // Atomic create + link: inserts the todo row and its first source link in
  // a single transaction so Temporal retries can't observe a half-written
  // state (orphan todo without a source row, or vice versa).
  static async makeNewWithSource(
    auth: Authenticator,
    {
      blob,
      itemId,
      source,
    }: {
      blob: Omit<
        CreationAttributes<ProjectTaskModel>,
        "workspaceId" | "category"
      >;
      itemId: string;
      source: ProjectTaskSourceInfo;
    },
    transaction?: Transaction
  ): Promise<ProjectTaskResource> {
    return withTransaction(async (t) => {
      const todo = await ProjectTaskResource.makeNew(auth, blob, t);
      await todo.upsertSource(auth, { itemId, source }, t);
      return todo;
    }, transaction);
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ProjectTaskType {
    return {
      id: this.id,
      sId: this.sId,
      user: this.assignee,
      conversationId: this.conversationSId,
      conversationSidebarStatus: null,
      conversationIsRunningAgentLoop: null,
      text: this.text,
      status: this.status,
      doneAt: this.doneAt,
      actorRationale: this.actorRationale,
      agentInstructions: this.agentInstructions,
      createdByType: this.createdByType,
      createdByAgentConfigurationId: this.createdByAgentConfigurationId,
      createdByUserId: this.createdByUserSId,
      agentSuggestionStatus: this.agentSuggestionStatus,
      agentSuggestionReviewedAt: this.agentSuggestionReviewedAt,
      markedAsDoneByType: this.markedAsDoneByType,
      markedAsDoneByAgentConfigurationId:
        this.markedAsDoneByAgentConfigurationId,
      markedAsDoneByUserId: this.markedAsDoneByUserSId,
      sources: [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // Applies the same updates to a batch of todos in a single transaction.
  // Scoped to the given space so unrelated or cross-space todos cannot be
  // touched via this path.
  static async bulkUpdateWithVersionBySIds(
    auth: Authenticator,
    {
      sIds,
      spaceId,
      updates,
    }: {
      sIds: string[];
      spaceId: ModelId;
      updates: Parameters<ProjectTaskResource["updateWithVersion"]>[1];
    }
  ): Promise<Result<{ updatedCount: number }, Error>> {
    if (sIds.length === 0) {
      return new Ok({ updatedCount: 0 });
    }

    const ids: ModelId[] = [];
    for (const sId of sIds) {
      const id = getResourceIdFromSId(sId);
      if (id === null) {
        return new Err(new Error(`Invalid todo id: ${sId}`));
      }
      ids.push(id);
    }

    const todos = await this.baseFetch(auth, {
      where: {
        id: { [Op.in]: ids },
        spaceId,
      },
    });

    if (todos.length !== sIds.length) {
      return new Err(new Error("Some todos were not found or not accessible."));
    }

    await withTransaction(async (t) => {
      for (const todo of todos) {
        await todo.updateWithVersion(auth, updates, t);
      }
    });

    return new Ok({ updatedCount: todos.length });
  }

  async approveAgentSuggestion(
    auth: Authenticator,
    { reviewedByUserId }: { reviewedByUserId: ModelId }
  ): Promise<void> {
    await this.updateWithVersion(auth, {
      agentSuggestionStatus: "approved",
      agentSuggestionReviewedAt: new Date(),
      agentSuggestionReviewedByUserId: reviewedByUserId,
    });
  }

  async rejectAgentSuggestion(
    auth: Authenticator,
    { reviewedByUserId }: { reviewedByUserId: ModelId }
  ): Promise<void> {
    await this.updateWithVersion(auth, {
      agentSuggestionStatus: "rejected",
      agentSuggestionReviewedAt: new Date(),
      agentSuggestionReviewedByUserId: reviewedByUserId,
      deletedAt: new Date(),
    });
  }

  async softDelete(auth: Authenticator): Promise<Result<undefined, Error>> {
    await this.updateWithVersion(auth, { deletedAt: new Date() });

    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await ProjectTaskConversationModel.destroy({
      where: { workspaceId, projectTodoId: this.id },
      transaction,
    });

    await ProjectTaskSourceModel.destroy({
      where: { workspaceId, projectTodoId: this.id },
      transaction,
    });

    const versionWhere: WhereOptions<ProjectTaskVersionModel> = {
      workspaceId,
      projectTodoId: this.id,
    };
    await ProjectTaskVersionModel.destroy({ where: versionWhere, transaction });

    await this.model.destroy({
      where: { workspaceId, id: this.id },
      transaction,
    });

    return new Ok(undefined);
  }
}
