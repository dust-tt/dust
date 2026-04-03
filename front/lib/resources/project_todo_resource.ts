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
  ProjectTodoCategory,
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

  // Returns the latest version of every todo for a given space
  // and category, paired with the source conversation info needed to check
  // whether the originating ConversationTodoVersioned action item is still active.
  // Used by the merge-into-project algorithm for both upsert lookups
  static async fetchLatestBySpaceWithSources(
    auth: Authenticator,
    { spaceId, category }: { spaceId: ModelId; category: ProjectTodoCategory }
  ): Promise<
    Array<{
      todo: ProjectTodoResource;
      sourceConversationId: ModelId | null;
      conversationTodoVersionedActionItemSId: string | null;
    }>
  > {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Load all version rows for todos in this space + category,
    // sorted so we can determine both the first and the latest version in one
    // pass (first id needed to locate the source row, last row = latest data).
    const all = await this.baseFetch(auth, {
      where: { spaceId: spaceId, category },
      order: [
        ["sId", "ASC"],
        ["version", "ASC"],
      ],
    });

    if (all.length === 0) {
      return [];
    }

    // One pass: track the first version's id (for source lookup) and the last
    // version's resource (latest data) for each sId.
    const firstIdBySId = new Map<string, ModelId>();
    const latestBySId = new Map<string, ProjectTodoResource>();
    for (const todo of all) {
      if (!firstIdBySId.has(todo.sId)) {
        firstIdBySId.set(todo.sId, todo.id);
      }
      latestBySId.set(todo.sId, todo);
    }

    // Bulk-fetch source rows linked to the first-version ids.
    const firstIds = Array.from(firstIdBySId.values());
    const sources = await ProjectTodoSourceModel.findAll({
      where: {
        workspaceId,
        projectTodoId: { [Op.in]: firstIds },
      },
    });
    const sourceByFirstId = new Map(sources.map((s) => [s.projectTodoId, s]));

    return Array.from(latestBySId.entries()).map(([sId, todo]) => {
      const firstId = firstIdBySId.get(sId);
      const source =
        firstId !== undefined ? sourceByFirstId.get(firstId) : undefined;
      return {
        todo,
        sourceConversationId: source?.sourceConversationId ?? null,
        conversationTodoVersionedActionItemSId:
          source?.conversationTodoVersionedActionItemSId ?? null,
      };
    });
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
      conversationTodoVersionedActionItemSId,
    }: {
      sourceType: ProjectTodoSourceType;
      sourceConversationId: ModelId | null;
      conversationTodoVersionedActionItemSId?: string;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceConversationId: sourceConversationId ?? null,
        conversationTodoVersionedActionItemSId:
          conversationTodoVersionedActionItemSId ?? null,
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
