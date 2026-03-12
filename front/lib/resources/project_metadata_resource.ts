import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ProjectMetadataType } from "@app/types/project_metadata";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";

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
    blob: Omit<
      CreationAttributes<ProjectMetadataModel>,
      "workspaceId" | "spaceId"
    >,
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

  toJSON(): ProjectMetadataType {
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
    };
  }
}
