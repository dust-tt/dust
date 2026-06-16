import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { PodMetadataType } from "@app/types/project_metadata";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";

export type ProjectMetadataBlob = Omit<
  CreationAttributes<ProjectMetadataModel>,
  "workspaceId" | "spaceId"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectMetadataResource
  extends ReadonlyAttributesType<ProjectMetadataModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectMetadataResource extends BaseResource<ProjectMetadataModel> {
  static model: typeof ProjectMetadataModel = ProjectMetadataModel;

  constructor(
    model: typeof ProjectMetadataModel,
    blob: Attributes<ProjectMetadataModel>,
    readonly spaceId: number
  ) {
    super(ProjectMetadataModel, blob);
  }

  static fromModel(
    model: ProjectMetadataModel,
    spaceId: number
  ): ProjectMetadataResource {
    return new ProjectMetadataResource(
      ProjectMetadataModel,
      model.get(),
      spaceId
    );
  }

  get sId(): string {
    return ProjectMetadataResource.modelIdToSId({
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
    return makeSId("project_metadata", {
      id,
      workspaceId,
    });
  }

  static async fetchBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<ProjectMetadataResource | null> {
    if (!space.isProject()) {
      return null;
    }

    const resources = await this.fetchBySpaceIds(auth, [space.id]);
    return resources.length > 0 ? resources[0] : null;
  }

  static async fetchBySpaceIds(
    auth: Authenticator,
    spaceIds: number[]
  ): Promise<ProjectMetadataResource[]> {
    const models = await ProjectMetadataModel.findAll({
      where: {
        spaceId: spaceIds,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return models.map((model) =>
      ProjectMetadataResource.fromModel(model, model.spaceId)
    );
  }

  static async makeNew(
    auth: Authenticator,
    space: SpaceResource,
    blob: ProjectMetadataBlob,
    transaction?: Transaction
  ): Promise<ProjectMetadataResource> {
    const model = await ProjectMetadataModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
      },
      { transaction }
    );

    return ProjectMetadataResource.fromModel(model, space.id);
  }

  async archive(transaction?: Transaction) {
    await this.update({ archivedAt: new Date() }, transaction);
  }

  async unarchive(transaction?: Transaction) {
    await this.update({ archivedAt: null }, transaction);
  }

  async updateDescription(
    description: string | null,
    transaction?: Transaction
  ) {
    await this.update({ description }, transaction);
  }

  updateDescriptionAndPinnedFramePath(blob: {
    description?: string | null;
    pinnedFramePath?: string | null;
  }) {
    return this.update(blob);
  }

  async updateLastTodoAnalysisAt(
    lastTodoAnalysisAt: Date | null,
    transaction?: Transaction
  ) {
    await this.update({ lastTodoAnalysisAt }, transaction);
  }

  /** Sets last analysis time and clears one-time first-sync lookback (if any). */
  async recordTodoAnalysisComplete(
    documentsLastFetchedAt: Date,
    transaction?: Transaction
  ) {
    await this.update(
      {
        lastTodoAnalysisAt: documentsLastFetchedAt,
        initialTodoAnalysisLookback: null,
      },
      transaction
    );
  }

  async updateTodoGenerationEnabled(
    todoGenerationEnabled: boolean,
    transaction?: Transaction
  ) {
    await this.update({ todoGenerationEnabled }, transaction);
  }

  async updateInitialTodoAnalysisLookback(
    initialTodoAnalysisLookback: string | null,
    transaction?: Transaction
  ) {
    await this.update({ initialTodoAnalysisLookback }, transaction);
  }

  async updatePinnedFramePath(
    pinnedFramePath: string | null,
    transaction?: Transaction
  ) {
    await this.update({ pinnedFramePath }, transaction);
  }

  // Persists the pod's default agent sId. The caller is responsible for validating that the
  // agent exists and is usable in the workspace (global or workspace agent) — see the PATCH
  // project_metadata route, which uses getAgentConfiguration() for that.
  async updateDefaultAgentId(
    defaultAgentId: string | null,
    transaction?: Transaction
  ) {
    await this.update({ defaultAgentId }, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await ProjectMetadataModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): PodMetadataType {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: SpaceResource.modelIdToSId({
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      description: this.description,
      archivedAt: this.archivedAt?.getTime() ?? null,
      todoGenerationEnabled: this.todoGenerationEnabled,
      lastTodoAnalysisAt: this.lastTodoAnalysisAt?.getTime() ?? null,
      pinnedFramePath: this.pinnedFramePath ?? null,
      defaultAgentId: this.defaultAgentId ?? null,
    };
  }
}
