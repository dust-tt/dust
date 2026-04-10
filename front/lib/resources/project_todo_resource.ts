import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  ProjectTodoConversationModel,
  ProjectTodoModel,
  ProjectTodoSourceModel,
} from "@app/lib/resources/storage/models/project_todo";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  ProjectTodoSourceType,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import {
  type Attributes,
  type CreationAttributes,
  type ModelStatic,
  Op,
  type Transaction,
} from "sequelize";

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

  // ── Creation ────────────────────────────────────────────────────────────────

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ProjectTodoModel>, "workspaceId" | "sId">,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    const todo = await ProjectTodoModel.create(
      {
        ...blob,
        sId: generateRandomModelSId(),
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(ProjectTodoModel, todo.get());
  }

  // Inserts a new version row for this logical todo, copying unchanged fields and
  // applying the supplied updates. Mirrors the AgentConfiguration update pattern.
  async createVersion(
    auth: Authenticator,
    updates: Partial<
      Omit<
        CreationAttributes<ProjectTodoModel>,
        "workspaceId" | "sId" | "version"
      >
    >,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    const newRow = await ProjectTodoModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: this.sId,
        version: this.version + 1,
        spaceId: this.spaceId,
        userId: this.userId,
        createdByType: this.createdByType,
        createdByUserId: this.createdByUserId ?? null,
        createdByAgentConfigurationId:
          this.createdByAgentConfigurationId ?? null,
        markedAsDoneByType: this.markedAsDoneByType ?? null,
        markedAsDoneByUserId: this.markedAsDoneByUserId ?? null,
        markedAsDoneByAgentConfigurationId:
          this.markedAsDoneByAgentConfigurationId ?? null,
        category: this.category,
        text: this.text,
        status: this.status,
        doneAt: this.doneAt ?? null,
        actorRationale: this.actorRationale ?? null,
        ...updates,
      },
      { transaction }
    );

    return new ProjectTodoResource(ProjectTodoModel, newRow.get());
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

  // Fetches the latest version of a todo by its stable sId.
  static async fetchBySId(
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTodoResource | null> {
    const results = await this.baseFetch(auth, {
      where: { sId },
      order: [["version", "DESC"]],
      limit: 1,
    });

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

  // Returns only the latest version of each logical todo for the given space.
  static async fetchLatestBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.fetchLatestBySpaceForUser(auth, {
      spaceId,
      userId: auth.getNonNullableUser().id,
    });
  }

  // Returns the latest version of each logical todo for an explicit target userId
  // in the given space. Mirrors fetchLatestBySpace but takes an explicit userId
  // instead of using auth.user — needed by the merge workflow, which acts on
  // behalf of specific target users rather than the authenticated principal.
  static async fetchLatestBySpaceForUser(
    auth: Authenticator,
    { spaceId, userId }: { spaceId: ModelId; userId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    const all = await this.baseFetch(auth, {
      where: { spaceId, userId },
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    // O(n) deduplication — keep the first occurrence per sId (highest version).
    const latestBySId = new Map<string, ProjectTodoResource>();
    for (const todo of all) {
      if (!latestBySId.has(todo.sId)) {
        latestBySId.set(todo.sId, todo);
      }
    }

    return Array.from(latestBySId.values());
  }

  // Returns every version row for (spaceId, userId), across all sIds. Used by the
  // diff algorithm to reconstruct snapshots at arbitrary cutoff dates.
  static async fetchAllVersionsBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.baseFetch(auth, {
      where: { spaceId, userId: auth.getNonNullableUser().id },
      order: [
        ["sId", "ASC"],
        ["version", "ASC"],
      ],
    });
  }

  // Batch variant of fetchBySourceId. Returns a map from `${sourceId}:${userId}`
  // to the latest version of each matching todo. Replaces per-item lookups in the
  // merge workflow with three queries total instead of N*(2–3).
  static async fetchBySourceIds(
    auth: Authenticator,
    { sourceIds }: { sourceIds: string[] }
  ): Promise<Map<string, ProjectTodoResource>> {
    if (sourceIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    // Step 1: Find all source links for the given item IDs in a single query.
    const sources = await ProjectTodoSourceModel.findAll({
      where: { workspaceId, sourceId: { [Op.in]: sourceIds } },
    });
    if (sources.length === 0) {
      return new Map();
    }

    // Step 2: Fetch the linked todo rows (any version) to resolve their stable
    // sIds — sources point to a specific version's PK, not the sId directly.
    const linkedModelIds = [...new Set(sources.map((s) => s.projectTodoId))];
    const linkedRows = await this.baseFetch(auth, {
      where: { id: { [Op.in]: linkedModelIds } },
    });
    if (linkedRows.length === 0) {
      return new Map();
    }

    // Step 3: Batch-fetch all versions of those todos and keep the latest per sId.
    const uniqueSIds = [...new Set(linkedRows.map((t) => t.sId))];
    const allVersions = await this.baseFetch(auth, {
      where: { sId: { [Op.in]: uniqueSIds } },
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });
    const latestBySId = new Map<string, ProjectTodoResource>();
    for (const todo of allVersions) {
      if (!latestBySId.has(todo.sId)) {
        latestBySId.set(todo.sId, todo);
      }
    }

    // Build a lookup from linked row model id → sId to bridge sources to latest.
    const sIdByModelId = new Map<ModelId, string>(
      linkedRows.map((t) => [t.id, t.sId])
    );

    // Result: `${sourceId}:${userId}` → latest ProjectTodoResource.
    const result = new Map<string, ProjectTodoResource>();
    for (const source of sources) {
      const sId = sIdByModelId.get(source.projectTodoId);
      if (!sId) {
        continue;
      }
      const latest = latestBySId.get(sId);
      if (!latest) {
        continue;
      }
      result.set(`${source.sourceId}:${latest.userId}`, latest);
    }

    return result;
  }

  // ── Output conversation links (todo => conversation) ────────────────────

  async addOutputConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoConversationModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        conversationId,
      },
      { transaction }
    );
  }

  async removeOutputConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoConversationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        conversationId,
      },
      transaction,
    });
  }

  // ── Source links (* => todo) ─────────────────────────────────────────────

  async addSource(
    auth: Authenticator,
    {
      sourceType,
      sourceId,
    }: {
      sourceType: ProjectTodoSourceType;
      sourceId: string;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceId,
      },
      { transaction }
    );
  }

  async removeSource(
    auth: Authenticator,
    {
      sourceType,
      sourceId,
    }: {
      sourceType: ProjectTodoSourceType;
      sourceId: string;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceId,
      },
      transaction,
    });
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ProjectTodoType {
    return {
      id: this.id,
      sId: this.sId,
      category: this.category,
      text: this.text,
      status: this.status,
      version: this.version,
      doneAt: this.doneAt,
      actorRationale: this.actorRationale,
      createdByType: this.createdByType,
      createdByAgentConfigurationId: this.createdByAgentConfigurationId,
      markedAsDoneByType: this.markedAsDoneByType,
      markedAsDoneByAgentConfigurationId:
        this.markedAsDoneByAgentConfigurationId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await ProjectTodoConversationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
      },
      transaction,
    });

    await ProjectTodoSourceModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
      },
      transaction,
    });

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}
