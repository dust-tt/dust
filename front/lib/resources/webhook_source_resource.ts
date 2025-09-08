import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceModel } from "@app/lib/models/assistant/triggers/webhook_source";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types";
import { normalizeError, redactString } from "@app/types";
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
    try {
      const webhookSource = await WebhookSourceModel.create(blob, {
        transaction,
      });

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

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth, {
      order: [["createdAt", "DESC"]],
    });
  }

  static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<InferAttributes<WebhookSourceModel, { omit: "workspaceId" }>>,
    transaction?: Transaction
  ) {
    const webhookSource = await this.fetchById(auth, sId);
    if (!webhookSource) {
      return new Err(new Error(`WebhookSource with sId ${sId} not found`));
    }

    try {
      await webhookSource.update(blob, transaction);
      return new Ok(webhookSource);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
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
