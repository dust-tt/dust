import type { Attributes, ModelStatic } from "sequelize";
import type { Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceResource
  extends ReadonlyAttributesType<WorkspaceModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceResource extends BaseResource<WorkspaceModel> {
  static model: ModelStatic<WorkspaceModel> = WorkspaceModel;

  readonly blob: Attributes<WorkspaceModel>;

  constructor(
    model: ModelStatic<WorkspaceModel>,
    blob: Attributes<WorkspaceModel>
  ) {
    super(WorkspaceModel, blob);
    this.blob = blob;
  }

  static async makeNew(
    blob: Omit<
      Attributes<WorkspaceModel>,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "description"
      | "segmentation"
      | "ssoEnforced"
      | "workOSOrganizationId"
      | "whiteListedProviders"
      | "defaultEmbeddingProvider"
      | "metadata"
      | "conversationsRetentionDays"
    > &
      Partial<
        Pick<
          Attributes<WorkspaceModel>,
          | "description"
          | "segmentation"
          | "ssoEnforced"
          | "workOSOrganizationId"
          | "whiteListedProviders"
          | "defaultEmbeddingProvider"
          | "metadata"
          | "conversationsRetentionDays"
        >
      >
  ): Promise<WorkspaceResource> {
    const user = await WorkspaceModel.create(blob);
    return new this(WorkspaceModel, user.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    try {
      const deletedCount = await WorkspaceModel.destroy({
        where: { id: this.blob.id },
        transaction,
      });
      return new Ok(deletedCount);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  toLogJSON(): ResourceLogJSON {
    return {
      sId: this.blob.sId,
    };
  }
}
