import type { Authenticator } from "@app/lib/auth";
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
import { Ok, type Result } from "@app/types/shared/result";
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

  // Reconstructs the list of todos as they existed at `timestamp` for a given
  // (space, user) pair. For each main row created `<= timestamp`, we pick the
  // earliest version row with `createdAt > timestamp` as the snapshot at that
  // time; if no such version exists, the current row is itself the state at
  // `timestamp`. Rows whose reconstructed state is already deleted or cleaned
  // are filtered out. Results are not persisted — resources are built directly
  // from the reconstructed attribute blobs.
  static async fetchLatestBySpaceForUserAtTimestamp(
    auth: Authenticator,
    {
      spaceId,
      userId,
      timestamp,
    }: { spaceId: ModelId; userId: ModelId; timestamp: Date }
  ): Promise<ProjectTodoResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Step 1: fetch candidate main rows — includes currently deleted / cleaned
    // todos, because they may have been live at `timestamp`. Bypasses the
    // baseFetch filters intentionally.
    const mainRows = await ProjectTodoModel.findAll({
      where: {
        workspaceId,
        spaceId,
        userId,
        createdAt: { [Op.lte]: timestamp },
      },
      order: [["createdAt", "DESC"]],
    });

    if (mainRows.length === 0) {
      return [];
    }

    // Step 2: fetch all versions whose `createdAt > timestamp` for these todos.
    // The earliest such version per todo holds the snapshot at `timestamp`.
    const mainIds = mainRows.map((r) => r.id);
    const versionWhere: WhereOptions<ProjectTodoVersionModel> = {
      workspaceId,
      projectTodoId: { [Op.in]: mainIds },
      createdAt: { [Op.gt]: timestamp },
    };
    const laterVersions = await ProjectTodoVersionModel.findAll({
      where: versionWhere,
      order: [["createdAt", "ASC"]],
    });

    const earliestVersionByTodoId = new Map<ModelId, ProjectTodoVersionModel>();
    for (const version of laterVersions) {
      if (!earliestVersionByTodoId.has(version.projectTodoId)) {
        earliestVersionByTodoId.set(version.projectTodoId, version);
      }
    }

    // Step 3: build reconstructed attribute blobs.
    const reconstructed: ProjectTodoResource[] = [];
    for (const row of mainRows) {
      const snapshot = earliestVersionByTodoId.get(row.id);

      if (snapshot) {
        // Use the version snapshot — but keep the main row's id and createdAt
        // so the reconstructed resource is keyed by the logical todo identity.
        const rowAttrs = row.get();
        const snapshotAttrs = snapshot.get();
        const blob: Attributes<ProjectTodoModel> = {
          ...rowAttrs,
          category: snapshotAttrs.category,
          text: snapshotAttrs.text,
          status: snapshotAttrs.status,
          doneAt: snapshotAttrs.doneAt,
          actorRationale: snapshotAttrs.actorRationale,
          markedAsDoneByType: snapshotAttrs.markedAsDoneByType,
          markedAsDoneByUserId: snapshotAttrs.markedAsDoneByUserId,
          markedAsDoneByAgentConfigurationId:
            snapshotAttrs.markedAsDoneByAgentConfigurationId,
          deletedAt: snapshotAttrs.deletedAt,
          cleanedAt: snapshotAttrs.cleanedAt,
        };
        if (blob.deletedAt !== null || blob.cleanedAt !== null) {
          continue;
        }
        reconstructed.push(new this(ProjectTodoModel, blob));
      } else {
        // No version created after `timestamp` → the current row is the state
        // at `timestamp`. Drop it if it is now deleted or cleaned.
        if (row.deletedAt !== null || row.cleanedAt !== null) {
          continue;
        }
        reconstructed.push(new this(ProjectTodoModel, row.get()));
      }
    }

    return reconstructed;
  }

  // Batch variant: fetches the current todo row for each sourceId in one pass.
  // Returns a map from `${sourceId}:${userId}` to the matching ProjectTodoResource.
  static async fetchBySourceIds(
    auth: Authenticator,
    { sourceIds }: { sourceIds: string[] }
  ): Promise<Map<string, ProjectTodoResource>> {
    if (sourceIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    // Step 1: Find all source links for the given item IDs.
    const sources = await ProjectTodoSourceModel.findAll({
      where: { workspaceId, sourceId: { [Op.in]: sourceIds } },
    });
    if (sources.length === 0) {
      return new Map();
    }

    // Step 2: Fetch the linked todo rows.
    const linkedModelIds = [...new Set(sources.map((s) => s.projectTodoId))];
    const linkedRows = await this.baseFetch(auth, {
      where: { id: { [Op.in]: linkedModelIds } },
    });
    if (linkedRows.length === 0) {
      return new Map();
    }

    // Build a lookup from model id → resource.
    const rowById = new Map<ModelId, ProjectTodoResource>(
      linkedRows.map((t) => [t.id, t])
    );

    // Result: `${sourceId}:${userId}` → ProjectTodoResource.
    const result = new Map<string, ProjectTodoResource>();
    for (const source of sources) {
      const todo = rowById.get(source.projectTodoId);
      if (!todo) {
        continue;
      }
      result.set(`${source.sourceId}:${todo.userId}`, todo);
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

  // ── Source links (* => todo) ─────────────────────────────────────────────

  async upsertSource(
    auth: Authenticator,
    {
      source,
    }: {
      source: ProjectTodoSourceInfo;
    },
    transaction?: Transaction
  ): Promise<void> {
    const where = {
      workspaceId: auth.getNonNullableWorkspace().id,
      projectTodoId: this.id,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    };
    const [sourceInstance, created] = await ProjectTodoSourceModel.findOrCreate(
      {
        where,
        defaults: {
          ...where,
          sourceTitle: source.sourceTitle,
          sourceUrl: source.sourceUrl,
        },
        transaction,
      }
    );
    if (!created) {
      await sourceInstance.update(
        {
          sourceTitle: source.sourceTitle,
          sourceUrl: source.sourceUrl,
        },
        { transaction }
      );
    }
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ProjectTodoType {
    return {
      id: this.id,
      sId: this.sId,
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
