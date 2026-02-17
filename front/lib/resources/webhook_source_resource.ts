import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceModel } from "@app/lib/models/agent/triggers/webhook_source";
import { WebhookSourcesViewModel } from "@app/lib/models/agent/triggers/webhook_sources_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { redactString } from "@app/types/shared/utils/string_utils";
import type {
  WebhookSourceForAdminType as WebhookSourceForAdminType,
  WebhookSourceType,
} from "@app/types/triggers/webhooks";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
    {
      icon,
      description,
    }: {
      icon?: string;
      description?: string;
    } = {}
  ): Promise<WebhookSourceResource> {
    assert(
      await SpaceResource.canAdministrateSystemSpace(auth),
      "The user is not authorized to create a webhook source"
    );

    return withTransaction(async (transaction) => {
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
          description: description ?? "",
          icon: normalizeWebhookIcon(icon),
        },
        {
          transaction,
        }
      );

      return new this(WebhookSourceModel, webhookSource.get());
    });
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
    return this.baseFetch(auth);
  }

  async updateRemoteMetadata(
    updates: Partial<
      Pick<WebhookSourceModel, "remoteMetadata" | "oauthConnectionId">
    >
  ): Promise<void> {
    await this.update(updates);
  }

  async updateSecret(secret: WebhookSourceModel["secret"]): Promise<void> {
    await this.update({ secret });
  }

  /**
   * Low-level delete that only removes this webhook source record.
   * Use deleteWebhookSource from lib/api/webhook_source.ts for full deletion
   * including views, triggers, and webhook requests.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    return this.hardDelete(auth, { transaction });
  }

  async hardDelete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);
    assert(
      canAdministrate,
      "The user is not authorized to delete a webhook source"
    );

    await WebhookSourceModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
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

  get sId(): string {
    return WebhookSourceResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  getSecretPotentiallyRedacted(): string | null {
    if (!this.secret) {
      return null;
    }
    // Redact secret when outside of the 10-minute window after creation.
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    return differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES
      ? redactString(this.secret, 4)
      : this.secret;
  }

  toJSON(): WebhookSourceType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      provider: this.provider,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      subscribedEvents: this.subscribedEvents,
    };
  }

  toJSONForAdmin(): WebhookSourceForAdminType {
    return {
      ...this.toJSON(),
      secret: this.getSecretPotentiallyRedacted(),
      urlSecret: this.urlSecret,
      signatureHeader: this.signatureHeader,
      signatureAlgorithm: this.signatureAlgorithm,
      remoteMetadata: this.remoteMetadata,
      oauthConnectionId: this.oauthConnectionId,
    };
  }
}
