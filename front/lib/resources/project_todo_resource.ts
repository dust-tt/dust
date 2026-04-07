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
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

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
  // Fetches all version rows ordered by (sId ASC, version DESC) then keeps
  // only the first occurrence per sId, which has the highest version number.
  static async fetchLatestBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    const all = await this.baseFetch(auth, {
      where: { spaceId, userId: auth.getNonNullableUser().id },
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

  // ── Merge helpers ────────────────────────────────────────────────────────

  // Returns all follow_up todos for the current user in the space that are
  // linked to a specific conversation action item via
  // (sourceConversationId, conversationTodoItemSId). Used by Layer 1 of the
  // merge algorithm.
  //
  // Sources are always attached to version-1 rows (created by makeNew). We
  // look up the latest version for each linked sId so the caller always
  // receives the current state of each todo.
  static async fetchLinkedFollowUpsForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<
    Array<{
      todo: ProjectTodoResource;
      sourceConversationModelId: ModelId;
      conversationTodoItemSId: string;
    }>
  > {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const userId = auth.getNonNullableUser().id;

    // Step 1: Get all version-1 follow_up rows for the user in this space.
    const v1Rows = await ProjectTodoModel.findAll({
      where: {
        workspaceId,
        spaceId: spaceModelId,
        category: "follow_ups",
        userId,
        version: 1,
      },
    });

    if (v1Rows.length === 0) {
      return [];
    }

    const v1Ids = v1Rows.map((r) => r.id);

    // Step 2: Find source links with a conversationTodoItemSId for those rows.
    const sources = await ProjectTodoSourceModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: v1Ids },
        conversationTodoItemSId: { [Op.ne]: null },
      },
    });

    if (sources.length === 0) {
      return [];
    }

    // Step 3: Build (v1 row id → source) and (sId → source) mappings. Keep
    // only the first source per v1 row in case there are duplicates.
    const sourceByV1Id = new Map<
      ModelId,
      { sourceConversationModelId: ModelId; conversationTodoItemSId: string }
    >();
    for (const source of sources) {
      if (
        source.conversationTodoItemSId &&
        source.sourceConversationId !== null &&
        !sourceByV1Id.has(source.projectTodoId)
      ) {
        sourceByV1Id.set(source.projectTodoId, {
          sourceConversationModelId: source.sourceConversationId,
          conversationTodoItemSId: source.conversationTodoItemSId,
        });
      }
    }

    const sourceBySId = new Map<
      string,
      { sourceConversationModelId: ModelId; conversationTodoItemSId: string }
    >();
    for (const v1 of v1Rows) {
      const src = sourceByV1Id.get(v1.id);
      if (src) {
        sourceBySId.set(v1.sId, src);
      }
    }

    if (sourceBySId.size === 0) {
      return [];
    }

    // Step 4: Fetch the latest version for each linked sId.
    const sIds = Array.from(sourceBySId.keys());
    const latestRows = await ProjectTodoModel.findAll({
      where: {
        workspaceId,
        spaceId: spaceModelId,
        userId,
        sId: { [Op.in]: sIds },
      },
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    // Deduplicate: keep the first occurrence per sId (highest version).
    const latestBySId = new Map<string, ProjectTodoModel>();
    for (const row of latestRows) {
      if (!latestBySId.has(row.sId)) {
        latestBySId.set(row.sId, row);
      }
    }

    return Array.from(latestBySId.entries()).flatMap(([sId, row]) => {
      const src = sourceBySId.get(sId);
      if (!src) {
        return [];
      }
      return [{ todo: new this(ProjectTodoModel, row.get()), ...src }];
    });
  }

  // Returns the latest version of each open follow_up todo for the current
  // user in the space that has NO conversationTodoItemSId source link —
  // i.e., user-created (unlinked) todos. Used by Layer 2 of the merge
  // algorithm to identify todos the AI can auto-close.
  static async fetchOpenUnlinkedFollowUpsForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const userId = auth.getNonNullableUser().id;

    // Step 1: Get all version-1 follow_up rows for the user in this space.
    const v1Rows = await ProjectTodoModel.findAll({
      where: {
        workspaceId,
        spaceId: spaceModelId,
        category: "follow_ups",
        userId,
        version: 1,
      },
    });

    if (v1Rows.length === 0) {
      return [];
    }

    const v1Ids = v1Rows.map((r) => r.id);

    // Step 2: Find which v1 rows have a conversationTodoItemSId source link.
    const linkedSources = await ProjectTodoSourceModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: v1Ids },
        conversationTodoItemSId: { [Op.ne]: null },
      },
      attributes: ["projectTodoId"],
    });

    const linkedV1Ids = new Set(linkedSources.map((s) => s.projectTodoId));

    // Step 3: Determine sIds for unlinked (user-created) todos.
    const unlinkedSIds = v1Rows
      .filter((r) => !linkedV1Ids.has(r.id))
      .map((r) => r.sId);

    if (unlinkedSIds.length === 0) {
      return [];
    }

    // Step 4: Fetch all versions for unlinked sIds, ordered by (sId, version
    // DESC) so we can deduplicate to the latest version per sId.
    const allVersionRows = await ProjectTodoModel.findAll({
      where: {
        workspaceId,
        spaceId: spaceModelId,
        userId,
        sId: { [Op.in]: unlinkedSIds },
      },
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    const latestBySId = new Map<string, ProjectTodoResource>();
    for (const row of allVersionRows) {
      if (!latestBySId.has(row.sId)) {
        latestBySId.set(row.sId, new this(ProjectTodoModel, row.get()));
      }
    }

    // Return only open ones — "done" filter applied on the latest version.
    return Array.from(latestBySId.values()).filter((t) => t.status === "todo");
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
      sourceConversationId,
      conversationTodoItemSId,
    }: {
      sourceType: ProjectTodoSourceType;
      sourceConversationId: ModelId | null;
      conversationTodoItemSId?: string;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceConversationId: sourceConversationId ?? null,
        conversationTodoItemSId: conversationTodoItemSId ?? null,
      },
      { transaction }
    );
  }

  async removeSource(
    auth: Authenticator,
    {
      sourceType,
      sourceConversationId,
    }: {
      sourceType: ProjectTodoSourceType;
      sourceConversationId: ModelId | null;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceConversationId: sourceConversationId ?? null,
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
