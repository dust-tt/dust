import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { ProjectMetadataModel as ProjectMetadataModelClass } from "@app/lib/resources/storage/models/project_metadata";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ProjectMetadataType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectMetadataResource extends ReadonlyAttributesType<ProjectMetadataModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectMetadataResource extends BaseResource<ProjectMetadataModel> {
  static model: ModelStatic<ProjectMetadataModel> = ProjectMetadataModelClass;

  constructor(
    model: ModelStatic<ProjectMetadataModel>,
    blob: Attributes<ProjectMetadataModel>
  ) {
    super(ProjectMetadataModelClass, blob);
  }

  static async fetchBySpace(
    auth: Authenticator,
    { space }: { space: SpaceResource }
  ): Promise<ProjectMetadataResource | null> {
    const metadata = await ProjectMetadataModelClass.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: space.id,
      },
    });

    if (!metadata) {
      return null;
    }

    return new ProjectMetadataResource(
      ProjectMetadataModelClass,
      metadata.get()
    );
  }

  static async makeNew(
    auth: Authenticator,
    {
      space,
      status,
      description,
      tags,
      externalLinks,
    }: {
      space: SpaceResource;
      status?: "active" | "paused" | "completed" | "archived";
      description?: string | null;
      tags?: string[] | null;
      externalLinks?: { title: string; url: string }[] | null;
    },
    transaction?: Transaction
  ): Promise<ProjectMetadataResource> {
    const blob: CreationAttributes<ProjectMetadataModel> = {
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: space.id,
      status: status ?? "active",
      description: description ?? null,
      tags: tags ?? null,
      externalLinks: externalLinks ?? null,
    };

    const metadata = await ProjectMetadataModelClass.create(blob, {
      transaction,
    });

    return new ProjectMetadataResource(
      ProjectMetadataModelClass,
      metadata.get()
    );
  }

  async updateMetadata(
    auth: Authenticator,
    {
      status,
      description,
      tags,
      externalLinks,
    }: {
      status?: "active" | "paused" | "completed" | "archived";
      description?: string | null;
      tags?: string[] | null;
      externalLinks?: { title: string; url: string }[] | null;
    },
    transaction?: Transaction
  ): Promise<Result<ProjectMetadataResource, Error>> {
    try {
      const updateBlob: Partial<Attributes<ProjectMetadataModel>> = {};

      if (status !== undefined) {
        updateBlob.status = status;
      }
      if (description !== undefined) {
        updateBlob.description = description;
      }
      if (tags !== undefined) {
        updateBlob.tags = tags;
      }
      if (externalLinks !== undefined) {
        updateBlob.externalLinks = externalLinks;
      }

      await this.update(updateBlob, transaction);

      return new Ok(this);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    try {
      await ProjectMetadataModelClass.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(this.id);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  toJSON(): ProjectMetadataType {
    return {
      id: this.id,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: makeSId("space", {
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      status: this.status,
      description: this.description,
      tags: this.tags,
      externalLinks: this.externalLinks,
    };
  }
}
