import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  ProjectTodoConversationModel,
  ProjectTodoModel,
  ProjectTodoSourceModel,
} from "@app/lib/resources/storage/models/project_todo";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
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

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ProjectTodoModel>, "workspaceId">,
    transaction?: Transaction
  ): Promise<ProjectTodoResource> {
    const todo = await ProjectTodoModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(ProjectTodoModel, todo.get());
  }

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

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ProjectTodoResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const results = await this.baseFetch(auth, {
      where: { id: modelId },
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
    }: {
      sourceType: ProjectTodoSourceType;
      sourceConversationId: ModelId | null;
    },
    transaction?: Transaction
  ): Promise<void> {
    await ProjectTodoSourceModel.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        projectTodoId: this.id,
        sourceType,
        sourceConversationId: sourceConversationId ?? null,
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

  // ── Lifecycle ──────────────────────────────────────────────────────────

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

  toJSON(): ProjectTodoType {
    return {
      sId: this.sId,
      category: this.category,
      status: this.status,
      text: this.text,
      version: this.version,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      doneAt: this.doneAt ? this.doneAt.getTime() : null,
      actorRationale: this.actorRationale,
      createdByType: this.createdByType,
    };
  }

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
}
