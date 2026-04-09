import type {Authenticator} from "@app/lib/auth";
import {BaseResource} from "@app/lib/resources/base_resource";
import {
  ProjectTodoConversationModel,
  ProjectTodoModel,
  ProjectTodoSourceModel,
} from "@app/lib/resources/storage/models/project_todo";
import type {ReadonlyAttributesType} from "@app/lib/resources/storage/types";
import type {ModelStaticWorkspaceAware} from "@app/lib/resources/storage/wrappers/workspace_models";
import {generateRandomModelSId} from "@app/lib/resources/string_ids_server";
import type {ResourceFindOptions} from "@app/lib/resources/types";
import type {
  ProjectTodoCategory,
  ProjectTodoSourceType,
  ProjectTodoType,
} from "@app/types/project_todo";
import type {ModelId} from "@app/types/shared/model_id";
import {Ok, type Result} from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectTodoResource
  extends ReadonlyAttributesType<ProjectTodoModel> {
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectTodoResource extends BaseResource<ProjectTodoModel> {
  static model: ModelStaticWorkspaceAware<ProjectTodoModel> = ProjectTodoModel;

  constructor (
    model: ModelStatic<ProjectTodoModel>,
    blob: Attributes<ProjectTodoModel>
  ) {
    super (ProjectTodoModel, blob);
  }

  // ── Creation ────────────────────────────────────────────────────────────────

  static async makeNew (
    auth: Authenticator,
    blob: Omit<CreationAttributes<ProjectTodoModel>, "workspaceId" | "sId">,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    const todo = await ProjectTodoModel.create (
      {
        ...blob,
        sId: generateRandomModelSId (),
        workspaceId: auth.getNonNullableWorkspace ().id,
      },
      {transaction}
    );

    return new this (ProjectTodoModel, todo.get ());
  }

  // Inserts a new version row for this logical todo, copying unchanged fields and
  // applying the supplied updates. Mirrors the AgentConfiguration update pattern.
  async createVersion (
    auth: Authenticator,
    updates: Partial<
      Omit<
        CreationAttributes<ProjectTodoModel>,
        "workspaceId" | "sId" | "version"
      >
    >,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    const newRow = await ProjectTodoModel.create (
      {
        workspaceId: auth.getNonNullableWorkspace ().id,
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
      {transaction}
    );

    return new ProjectTodoResource (ProjectTodoModel, newRow.get ());
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────

  private static async baseFetch (
    auth: Authenticator,
    options?: ResourceFindOptions<ProjectTodoModel>,
    transaction?: Transaction
  ): Promise<ProjectTodoResource[]> {
    const {where, ...otherOptions} = options ?? {};

    const todos = await ProjectTodoModel.findAll ({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace ().id,
      },
      ...otherOptions,
      transaction,
    });

    if (todos.length === 0) {
      return [];
    }

    return todos.map ((t) => {
      return new this (ProjectTodoModel, t.get ());
    });
  }

  // Fetches the latest version of a todo by its stable sId.
  static async fetchBySId (
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTodoResource | null> {
    const results = await this.baseFetch (auth, {
      where: {sId},
      order: [["version", "DESC"]],
      limit: 1,
    });

    return results[0] ?? null;
  }

  static async fetchBySpace (
    auth: Authenticator,
    {spaceId}: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.baseFetch (auth, {
      where: {spaceId},
      order: [["createdAt", "DESC"]],
    });
  }

  // Returns only the latest version of each logical todo for the given space.
  // Fetches all version rows ordered by (sId ASC, version DESC) then keeps
  // only the first occurrence per sId, which has the highest version number.
  static async fetchLatestBySpace (
    auth: Authenticator,
    {spaceId}: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    const all = await this.baseFetch (auth, {
      where: {spaceId, userId: auth.getNonNullableUser ().id},
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    return this.toLatestBySId (all);
  }

  // Returns every version row for (spaceId, userId), across all sIds. Used by the
  // diff algorithm to reconstruct snapshots at arbitrary cutoff dates.
  static async fetchAllVersionsBySpace (
    auth: Authenticator,
    {spaceId}: { spaceId: ModelId }
  ): Promise<ProjectTodoResource[]> {
    return this.baseFetch (auth, {
      where: {spaceId, userId: auth.getNonNullableUser ().id},
      order: [
        ["sId", "ASC"],
        ["version", "ASC"],
      ],
    });
  }

  // Returns the latest version of each logical todo for the given user and
  // category within a space, capped to `limit` most-recently-created items.
  // Used by the deduplication pass in the merge workflow.
  static async fetchLatestByUserAndCategory (
    auth: Authenticator,
    {
      spaceId,
      userId,
      category,
      limit,
    }: {
      spaceId: ModelId;
      userId: ModelId;
      category: ProjectTodoCategory;
      limit: number;
    }
  ): Promise<ProjectTodoResource[]> {
    const all = await this.baseFetch (auth, {
      where: {spaceId, userId, category},
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    // Return the most recently created ones, up to `limit`.
    return this.toLatestBySId (all)
      .sort ((a, b) => b.createdAt.getTime () - a.createdAt.getTime ())
      .slice (0, limit);
  }

  // O(n) deduplication over a list pre-sorted by (sId ASC, version DESC):
  // keeps only the first row per sId, which is the highest version.
  private static toLatestBySId (
    todos: ProjectTodoResource[]
  ): ProjectTodoResource[] {
    const latestBySId = new Map<string, ProjectTodoResource> ();
    for (const todo of todos) {
      if (!latestBySId.has (todo.sId)) {
        latestBySId.set (todo.sId, todo);
      }
    }
    return Array.from (latestBySId.values ());
  }

  // Returns the latest version of an agent-created todo linked to the given
  // source item for a specific user, or null if none exists.
  // Used by the merge workflow to decide whether to create or update a todo.
  static async fetchBySourceId (
    auth: Authenticator,
    {
      sourceId,
      userId,
    }: {
      sourceId: string;
      userId: ModelId;
    }
  ): Promise<ProjectTodoResource | null> {
    const workspaceId = auth.getNonNullableWorkspace ().id;

    // Find source rows for this specific source item.
    const sources = await ProjectTodoSourceModel.findAll ({
      where: {
        workspaceId,
        sourceId,
      },
    });

    if (sources.length === 0) {
      return null;
    }

    const projectTodoModelIds = sources.map ((s) => s.projectTodoId);

    // Among the matched todos, find the one owned by the target user. There
    // should be at most one such row, but we pick the first for safety.
    const matched = await this.baseFetch (auth, {
      where: {id: {[Op.in]: projectTodoModelIds}, userId},
      limit: 1,
    });

    if (matched.length === 0) {
      return null;
    }

    // Return the latest version of the todo using its stable sId.
    return this.fetchBySId (auth, matched[0].sId);
  }

  // ── Output conversation links (todo => conversation) ────────────────────

  async addOutputConversation (
    auth: Authenticator,
    {conversationId}: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoConversationModel.create (
      {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
        conversationId,
      },
      {transaction}
    );
  }

  async removeOutputConversation (
    auth: Authenticator,
    {conversationId}: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoConversationModel.destroy ({
      where: {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
        conversationId,
      },
      transaction,
    });
  }

  // ── Source links (* => todo) ─────────────────────────────────────────────

  async addSource (
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
    await ProjectTodoSourceModel.create (
      {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
        sourceType,
        sourceId,
      },
      {transaction}
    );
  }

  async removeSource (
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
    await ProjectTodoSourceModel.destroy ({
      where: {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
        sourceType,
        sourceId,
      },
      transaction,
    });
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON (): ProjectTodoType {
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

  async delete (
    auth: Authenticator,
    {transaction}: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await ProjectTodoConversationModel.destroy ({
      where: {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
      },
      transaction,
    });

    await ProjectTodoSourceModel.destroy ({
      where: {
        workspaceId: auth.getNonNullableWorkspace ().id,
        projectTodoId: this.id,
      },
      transaction,
    });

    await this.model.destroy ({
      where: {
        workspaceId: auth.getNonNullableWorkspace ().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok (undefined);
  }
}
