import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { WebhookRequestModel } from "@app/lib/models/assistant/triggers/webhook_request";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface WebhookRequestResource
  extends ReadonlyAttributesType<WebhookRequestModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WebhookRequestResource extends BaseResource<WebhookRequestModel> {
  static model: ModelStatic<WebhookRequestModel> = WebhookRequestModel;

  constructor(
    model: ModelStatic<WebhookRequestModel>,
    blob: Attributes<WebhookRequestModel>
  ) {
    super(WebhookRequestModel, blob);
  }

  getGcsPath(this: WebhookRequestResource, auth: Authenticator): string {
    const workspace = auth.getNonNullableWorkspace();
    if (workspace.id !== this.workspaceId) {
      throw new Error("Workspace ID mismatch");
    }
    return `${workspace.sId}/webhook_source_${this.webhookSourceId}/webhook_request_${this.id}.json`;
  }

  async markAsFailed(this: WebhookRequestResource, errorMessage: string) {
    return this.update({
      status: "failed",
      errorMessage,
    });
  }

  static async makeNew(
    blob: CreationAttributes<WebhookRequestModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<WebhookRequestResource, Error>> {
    try {
      const webhookRequest = await WebhookRequestModel.create(blob, {
        transaction,
      });

      return new Ok(new this(WebhookRequestModel, webhookRequest.get()));
    } catch (error) {
      return new Err(error as Error);
    }
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<WebhookRequestModel> = {}
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

  static async fetchById(
    auth: Authenticator,
    id: ModelId
  ): Promise<Result<WebhookRequestResource | null, Error>> {
    try {
      const resources = await this.baseFetch(auth, {
        where: {
          id,
        },
        limit: 1,
      });

      if (resources.length === 0) {
        return new Ok(null);
      }

      return new Ok(resources[0]);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  static async fetchByWebhookSourceId(
    auth: Authenticator,
    webhookSourceId: ModelId,
    options: ResourceFindOptions<WebhookRequestModel> = {}
  ): Promise<Result<WebhookRequestResource[], Error>> {
    try {
      const resources = await this.baseFetch(auth, {
        ...options,
        where: {
          ...options.where,
          webhookSourceId,
        },
      });

      return new Ok(resources);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(error as Error);
    }
  }
}
