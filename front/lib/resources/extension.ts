import type { Authenticator } from "@app/lib/auth";
import { ExtensionConfigurationModel } from "@app/lib/models/extension";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ExtensionConfigurationType } from "@app/types/extension";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ExtensionConfigurationResource
  extends ReadonlyAttributesType<ExtensionConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExtensionConfigurationResource extends BaseResource<ExtensionConfigurationModel> {
  static model: ModelStaticWorkspaceAware<ExtensionConfigurationModel> =
    ExtensionConfigurationModel;

  constructor(
    model: ModelStatic<ExtensionConfigurationModel>,
    blob: Attributes<ExtensionConfigurationModel>
  ) {
    super(ExtensionConfigurationModel, blob);
  }

  get sId(): string {
    return ExtensionConfigurationResource.modelIdToSId({
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
    return makeSId("extension", {
      id,
      workspaceId,
    });
  }

  static async makeNew(
    blob: Omit<CreationAttributes<ExtensionConfigurationModel>, "workspaceId">,
    workspaceId: ModelId
  ) {
    const config = await ExtensionConfigurationModel.create({
      ...blob,
      workspaceId,
    });

    return new this(ExtensionConfigurationModel, config.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async deleteForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await ExtensionConfigurationModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async fetchForWorkspace(
    auth: Authenticator
  ): Promise<ExtensionConfigurationResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const config = await this.model.findOne({
      where: {
        workspaceId,
      },
    });

    return config ? new this(ExtensionConfigurationModel, config.get()) : null;
  }

  static async internalFetchForWorkspaces(
    workspaceIds: ModelId[]
  ): Promise<ExtensionConfigurationResource[]> {
    const configs = await this.model.findAll({
      where: {
        workspaceId: workspaceIds,
      },
      // WORKSPACE_ISOLATION_BYPASS: exceptional case where we need to fetch the blacklistedDomains \
      // across multiple workspaces in the login flow.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return configs.map(
      (config) => new this(ExtensionConfigurationModel, config.get())
    );
  }

  async updateBlacklistedDomains(
    auth: Authenticator,
    {
      blacklistedDomains,
    }: {
      blacklistedDomains: string[];
    }
  ) {
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      throw new Error(
        "Can't update extension configuration for another workspace."
      );
    }

    await this.update({
      blacklistedDomains,
    });
  }

  toJSON(): ExtensionConfigurationType {
    return {
      id: this.id,
      sId: this.sId,
      blacklistedDomains: this.blacklistedDomains,
    };
  }
}
