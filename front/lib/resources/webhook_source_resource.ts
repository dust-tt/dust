import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceModel } from "@app/lib/models/assistant/triggers/webhook_source";
import { WebhookSourcesViewModel } from "@app/lib/models/assistant/triggers/webhook_sources_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok, redactString } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface WebhookSourceResource
  extends ReadonlyAttributesType<WebhookSourceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WebhookSourceResource extends BaseResource<WebhookSourceModel> {
  static model: ModelStatic<WebhookSourceModel> = WebhookSourceModel;

  constructor(
    model: ModelStatic<WebhookSourceModel>,
    blob: Attributes<WebhookSourceModel>
  ) {
    super(WebhookSourceModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<WebhookSourceModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<WebhookSourceResource, Error>> {
    assert(
      await SpaceResource.canAdministrateSystemSpace(auth),
      "The user is not authorized to create a webhook source"
    );

    try {
      const webhookSource = await WebhookSourceModel.create(blob, {
        transaction,
      });

      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

      // Immediately create a view for the webhook source in the system space.
      await WebhookSourcesViewModel.create(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: systemSpace.id,
          editedAt: new Date(),
          editedByUserId: auth.user()?.id,
          webhookSourceId: webhookSource.id,
        },
        {
          transaction,
        }
      );

      return new Ok(new this(WebhookSourceModel, webhookSource.get()));
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<WebhookSourceModel> = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
      order: options.order,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async fetchByIds(auth: Authenticator, sIds: string[]) {
    const ids = sIds
      .map((sId) => getResourceIdFromSId(sId))
      .filter((id): id is number => id !== null);

    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: ids,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<WebhookSourceResource | null> {
    const res = await this.fetchByIds(auth, [sId]);
    return res.length > 0 ? res[0] : null;
  }

  static async fetchByName(
    auth: Authenticator,
    name: string
  ): Promise<WebhookSourceResource | null> {
    const res = await this.baseFetch(auth, {
      where: {
        name,
      },
      limit: 1,
    });
    return res.length > 0 ? res[0] : null;
  }

  static async findByPk(auth: Authenticator, id: ModelId) {
    const res = await this.baseFetch(auth, {
      where: {
        id,
      },
      limit: 1,
    });
    return res.length > 0 ? res[0] : null;
  }

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth, {
      order: [["createdAt", "DESC"]],
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
      // Directly delete the WebhookSourceViewModel to avoid a circular dependency.
      await WebhookSourcesViewModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          webhookSourceId: this.id,
        },
        // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
        // bypassing the soft deletion in place.
        hardDelete: true,
        transaction,
      });

      // Then delete the webhook source itself
      await WebhookSourceModel.destroy({
        where: {
          id: this.id,
          workspaceId: owner.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("webhook_source", {
      id,
      workspaceId,
    });
  }

  sId(): string {
    return WebhookSourceResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  toJSON(): WebhookSourceType {
    // Redact secret when outside of the 10-minute window after creation.
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const secret = this.secret
      ? differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES
        ? redactString(this.secret, 4)
        : this.secret
      : null;

    return {
      id: this.id,
      sId: this.sId(),
      name: this.name,
      secret,
      signatureHeader: this.signatureHeader,
      signatureAlgorithm: this.signatureAlgorithm,
      customHeaders: this.customHeaders,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
