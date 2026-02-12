import type { Attributes, CreationAttributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ProjectMetadataType } from "@app/types/project_metadata";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectMetadataResource
  extends ReadonlyAttributesType<ProjectMetadataModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectMetadataResource extends BaseResource<ProjectMetadataModel> {
  static model: typeof ProjectMetadataModel = ProjectMetadataModel;

  constructor(
    model: typeof ProjectMetadataModel,
    blob: Attributes<ProjectMetadataModel>,
    private readonly spaceSId: string
  ) {
    super(ProjectMetadataModel, blob);
  }

  static fromModel(
    model: ProjectMetadataModel,
    spaceSId: string
  ): ProjectMetadataResource {
    return new ProjectMetadataResource(
      ProjectMetadataModel,
      model.get(),
      spaceSId
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

    const model = await ProjectMetadataModel.findOne({
      where: {
        spaceId: space.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    if (!model) {
      return null;
    }

    return ProjectMetadataResource.fromModel(model, space.sId);
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

    return ProjectMetadataResource.fromModel(model, space.sId);
  }

  async updateMetadata(
    blob: Partial<{
      description: string | null;
    }>,
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    await this.update(blob, transaction);
    return new Ok(undefined);
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
      spaceId: this.spaceSId,
      description: this.description,
    };
  }
}
