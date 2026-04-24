import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  ProjectTodoConversationModel,
  ProjectTodoModel,
  ProjectTodoSourceModel,
  ProjectTodoVersionModel,
} from "@app/lib/resources/storage/models/project_todo";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ProjectTodoSourceInfo,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type { WhereOptions } from "sequelize";
import {
  type Attributes,
  type CreationAttributes,
  type ModelStatic,
  Op,
  type Transaction,
} from "sequelize";

type ProjectTodoVersionCreationAttributes =
  CreationAttributes<ProjectTodoModel> & {
    projectTodoId: ModelId;
    version: number;
  };

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectTodoResource
  extends ReadonlyAttributesType<ProjectTodoModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectTodoResource extends BaseResource<ProjectTodoModel> {
  static model: ModelStaticWorkspaceAware<ProjectTodoModel> = ProjectTodoModel;

  constructor(
    model: ModelStatic<ProjectTodoModel>,
    blob: Attributes<ProjectTodoModel>
  ) {
    super(ProjectTodoModel, blob);
  }

  // The stable string identifier for this todo, computed from the model's
  // integer id. External code must use this sId — never the raw model id.
  get sId(): string {
    return ProjectTodoResource.modelIdToSId({
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
    return makeSId("project_todo", { id, workspaceId });
  }

  // ── Creation ────────────────────────────────────────────────────────────────

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ProjectTodoModel>, "workspaceId">,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    return withTransaction(async (t) => {
      const todo = await ProjectTodoModel.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        { transaction: t }
      );

      return new this(ProjectTodoModel, todo.get());
    }, transaction);
  }

  // Snapshots the current mutable state into the version table, then updates
  // the main row in place. The version number is determined by the existing
  // snapshot count + 1.
  async updateWithVersion(
    auth: Authenticator,
    updates: Partial<
      Pick<
        CreationAttributes<ProjectTodoModel>,
        | "category"
        | "text"
        | "status"
        | "doneAt"
        | "actorRationale"
        | "markedAsDoneByType"
        | "markedAsDoneByUserId"
        | "markedAsDoneByAgentConfigurationId"
        | "deletedAt"
        | "cleanedAt"
      >
    >,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
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
    const where: WhereOptions<ProjectTodoVersionModel> = {
      workspaceId: this.workspaceId,
      projectTodoId: this.id,
    };

    const existingCount = await ProjectTodoVersionModel.count({
      where,
      transaction,
    });

    const versionData: ProjectTodoVersionCreationAttributes = {
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
      markedAsDoneByType: this.markedAsDoneByType ?? null,
      markedAsDoneByUserId: this.markedAsDoneByUserId ?? null,
      markedAsDoneByAgentConfigurationId:
        this.markedAsDoneByAgentConfigurationId ?? null,
      deletedAt: this.deletedAt ?? null,
      cleanedAt: this.cleanedAt ?? null,
    };
    await ProjectTodoVersionModel.create(versionData, { transaction });
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ProjectTodoModel>,
    transaction?: Transaction
  ): Promise<ProjectTodoResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const todos = await ProjectTodoModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        deletedAt: null,
        cleanedAt: null,
      },
      ...otherOptions,
      transaction,
    });

    if (todos.length === 0) {
      return [];
    }

    return todos.map((t) => {
      return new this(ProjectTodoModel, t.get());
    });
  }

  // Fetches a todo by its stable string sId.
  static async fetchBySId(
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTodoResource | null> {
    const id = getResourceIdFromSId(sId);
    if (id === null) {
      return null;
    }
    const results = await this.baseFetch(auth, { where: { id }, limit: 1 });
    return results[0] ?? null;
  }

  static async fetchBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.baseFetch(auth, {
      where: { spaceId },
      order: [["createdAt", "DESC"]],
    });
  }

  // Returns all todos for the authenticated user in the given space. Each row
  // in project_todos IS the latest state — no de-duplication needed.
  static async fetchLatestBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.fetchLatestBySpaceForUser(auth, {
      spaceId,
      userId: auth.getNonNullableUser().id,
    });
  }

  // Returns all todos for an explicit target userId in the given space.
  // Used by the merge workflow which acts on behalf of specific target users.
  static async fetchLatestBySpaceForUser(
    auth: Authenticator,
    { spaceId, userId }: { spaceId: ModelId; userId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.baseFetch(auth, {
      where: { spaceId, userId },
      order: [["createdAt", "DESC"]],
    });
  }

  // Batch variant: fetches the current todo row for each itemId in one pass.
  // Returns a map from `${itemId}:${userId}` to the matching ProjectTodoResource
  // — missing entries mean no todo yet exists for that (item, user) pair.
  //
  // This is the identity lookup used by the merge workflow's Phase 1 to detect
  // items that are already linked to a todo and can therefore skip dedup.
  static async fetchByItemIds(
    auth: Authenticator,
    { itemIds }: { itemIds: string[] }
  ): Promise<Map<string, Map<ModelId, ProjectTodoResource>>> {
    if (itemIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const sources = await ProjectTodoSourceModel.findAll({
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

    const rowById = new Map<ModelId, ProjectTodoResource>(
      linkedRows.map((t) => [t.id, t])
    );

    const result = new Map<string, Map<ModelId, ProjectTodoResource>>();
    for (const source of sources) {
      const todo = rowById.get(source.projectTodoId);
      if (!todo) {
        continue;
      }
      const byUser =
        result.get(source.itemId) ?? new Map<ModelId, ProjectTodoResource>();
      byUser.set(source.userId, todo);
      result.set(source.itemId, byUser);
    }

    return result;
  }

  // Returns all source entries grouped by logical todo sId. Because sources are
  // linked to specific version rows, this queries across ALL versions for the
  // given set of logical todo sIds and deduplicates by (sId, sourceType, sourceId).
  static async fetchSourcesForTodoIds(
    auth: Authenticator,
    { sIds }: { sIds: string[] }
  ): Promise<Map<string, Array<ProjectTodoSourceInfo>>> {
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
    const sources = await ProjectTodoSourceModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: [...idToSId.keys()] },
      },
    });

    // Group by logical todo sId.
    const result = new Map<string, Array<ProjectTodoSourceInfo>>();

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

  static async fetchConversationIdsForTodoIds(
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

    const rows = await ProjectTodoConversationModel.findAll({
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
      await ProjectTodoResource.fetchConversationIdsForTodoIds(auth, {
        sIds: [this.sId],
      });
    return conversationIds.get(this.sId) ?? null;
  }

  async addConversation(
    auth: Authenticator,
    { conversationModelId }: { conversationModelId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoConversationModel.findOrCreate({
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
  // by (workspaceId, itemId, userId): if a row already exists for this
  // (item, user) pair, its fields are updated to point at this todo and
  // source — so a Temporal activity retry after a partial success converges
  // to the same state instead of creating a duplicate.
  async upsertSource(
    auth: Authenticator,
    {
      itemId,
      source,
    }: {
      itemId: string;
      source: ProjectTodoSourceInfo;
    },
    transaction?: Transaction
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const identity = {
      workspaceId,
      itemId,
      userId: this.userId,
    };
    const payload = {
      projectTodoId: this.id,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
    };

    const [sourceInstance, created] = await ProjectTodoSourceModel.findOrCreate(
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
      blob: Omit<CreationAttributes<ProjectTodoModel>, "workspaceId">;
      itemId: string;
      source: ProjectTodoSourceInfo;
    },
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    return withTransaction(async (t) => {
      const todo = await ProjectTodoResource.makeNew(auth, blob, t);
      await todo.upsertSource(auth, { itemId, source }, t);
      return todo;
    }, transaction);
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ProjectTodoType {
    return {
      id: this.id,
      sId: this.sId,
      conversationId: null,
      category: this.category,
      text: this.text,
      status: this.status,
      doneAt: this.doneAt,
      actorRationale: this.actorRationale,
      createdByType: this.createdByType,
      createdByAgentConfigurationId: this.createdByAgentConfigurationId,
      markedAsDoneByType: this.markedAsDoneByType,
      markedAsDoneByAgentConfigurationId:
        this.markedAsDoneByAgentConfigurationId,
      sources: [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // Hides all done todos for the authenticated user in the given space by
  // setting `cleanedAt`. Items are hidden from normal queries but preserved in
  // the database for potential future "show completed" views.
  static async cleanDoneBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<Result<{ cleanedCount: number }, Error>> {
    const doneTodos = await this.baseFetch(auth, {
      where: { spaceId, userId: auth.getNonNullableUser().id, status: "done" },
    });

    if (doneTodos.length === 0) {
      return new Ok({ cleanedCount: 0 });
    }

    await withTransaction(async (t) => {
      for (const todo of doneTodos) {
        await todo.updateWithVersion(auth, { cleanedAt: new Date() }, t);
      }
    });

    return new Ok({ cleanedCount: doneTodos.length });
  }

  // Applies the same updates to a batch of todos in a single transaction.
  // Scoped to the authenticated user + given space so unrelated or cross-user
  // todos cannot be touched via this path.
  static async bulkUpdateWithVersionBySIds(
    auth: Authenticator,
    {
      sIds,
      spaceId,
      updates,
    }: {
      sIds: string[];
      spaceId: ModelId;
      updates: Parameters<ProjectTodoResource["updateWithVersion"]>[1];
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
        userId: auth.getNonNullableUser().id,
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

  async softDelete(auth: Authenticator): Promise<Result<undefined, Error>> {
    await this.updateWithVersion(auth, { deletedAt: new Date() });

    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await ProjectTodoConversationModel.destroy({
      where: { workspaceId, projectTodoId: this.id },
      transaction,
    });

    await ProjectTodoSourceModel.destroy({
      where: { workspaceId, projectTodoId: this.id },
      transaction,
    });

    const versionWhere: WhereOptions<ProjectTodoVersionModel> = {
      workspaceId,
      projectTodoId: this.id,
    };
    await ProjectTodoVersionModel.destroy({ where: versionWhere, transaction });

    await this.model.destroy({
      where: { workspaceId, id: this.id },
      transaction,
    });

    return new Ok(undefined);
  }
}
