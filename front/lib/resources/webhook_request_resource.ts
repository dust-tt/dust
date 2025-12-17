import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { literal, Op, QueryTypes } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { WebhookRequestStatus } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

const MAX_WEBHOOK_REQUESTS_TO_KEEP = 1000;
const WEBHOOK_REQUEST_TTL = "30 day";

type CleanUpWorkspaceOptions = {
  webhookRequestTtl?: string;
  maxWebhookRequestsToKeep?: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  async markAsProcessed(this: WebhookRequestResource) {
    return this.update({
      status: "processed",
      processedAt: new Date(),
    });
  }

  async markAsFailed(this: WebhookRequestResource, errorMessage: string) {
    return this.update({
      status: "failed",
      errorMessage,
    });
  }

  async markRelatedTrigger({
    trigger,
    status,
    errorMessage,
  }: {
    trigger: TriggerType;
    status: WebhookRequestTriggerStatus;
    errorMessage?: string;
  }) {
    // Check if the record already exists (for retry scenarios)
    const existing = await WebhookRequestTriggerModel.findOne({
      where: {
        workspaceId: this.workspaceId,
        webhookRequestId: this.id,
        triggerId: trigger.id,
      },
    });

    if (existing) {
      // Update existing record
      await existing.update({
        status,
        errorMessage,
      });
    } else {
      // Create new record
      await WebhookRequestTriggerModel.create({
        workspaceId: this.workspaceId,
        webhookRequestId: this.id,
        triggerId: trigger.id,
        status,
        errorMessage,
      });
    }
  }

  static async makeNew(
    blob: CreationAttributes<WebhookRequestModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<WebhookRequestResource> {
    const webhookRequest = await this.model.create(blob, {
      transaction,
    });

    return new this(this.model, webhookRequest.get());
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
      offset: options.offset,
      order: options.order,
    });

    return res.map((c) => new this(this.model, c.get()));
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<WebhookRequestResource | null> {
    const resources = await this.baseFetch(auth, {
      where: {
        id,
      },
      limit: 1,
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchByWebhookSourceId(
    auth: Authenticator,
    webhookSourceId: ModelId,
    options: ResourceFindOptions<WebhookRequestModel> = {}
  ): Promise<WebhookRequestResource[]> {
    return this.baseFetch(auth, {
      ...options,
      where: {
        ...options.where,
        webhookSourceId,
      },
    });
  }

  static async fetchRecentByWebhookSourceModelId(
    auth: Authenticator,
    { webhookSourceId }: { webhookSourceId: ModelId },
    opts: ResourceFindOptions<WebhookRequestModel> = {}
  ): Promise<WebhookRequestResource[]> {
    return this.baseFetch(auth, {
      where: {
        ...opts.where,
        webhookSourceId,
      },
      order: opts.order,
      limit: opts.limit,
    });
  }

  static async listByStatus(
    auth: Authenticator,
    {
      status,
    }: {
      status: WebhookRequestStatus;
    }
  ): Promise<WebhookRequestResource[]> {
    return this.baseFetch(auth, {
      where: {
        status,
      },
    });
  }

  static async getWorkspaceIdsWithTooManyRequests({
    webhookRequestTtl = WEBHOOK_REQUEST_TTL,
    maxWebhookRequestsToKeep = MAX_WEBHOOK_REQUESTS_TO_KEEP,
  }: Partial<CleanUpWorkspaceOptions> = {}) {
    // eslint-disable-next-line dust/no-raw-sql
    const rows = await frontSequelize.query<{
      workspaceId: ModelId;
      total_entries: number;
      oldest_created_at: Date;
    }>(
      `
      SELECT
        "workspaceId",
          COUNT(*) AS "total_entries",
          MIN("createdAt") AS "oldest_created_at"
      FROM public.webhook_requests
      GROUP BY "workspaceId"
      HAVING
        COUNT(*) > :max_webhook_requests_to_keep
        OR MIN("createdAt") < now() - interval :webhook_request_ttl
      ORDER BY "workspaceId" ASC;
    `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          max_webhook_requests_to_keep: maxWebhookRequestsToKeep,
          webhook_request_ttl: webhookRequestTtl,
        },
      }
    );

    return rows.map((row) => row.workspaceId);
  }

  static async cleanUpWorkspace(
    auth: Authenticator,
    {
      webhookRequestTtl = WEBHOOK_REQUEST_TTL,
      maxWebhookRequestsToKeep = MAX_WEBHOOK_REQUESTS_TO_KEEP,
    }: Partial<CleanUpWorkspaceOptions> = {}
  ) {
    const oldRequests = await this.baseFetch(auth, {
      where: {
        createdAt: {
          [Op.lt]: literal(`now() - interval '${webhookRequestTtl}'`),
        },
      },
    });

    logger.info(
      {
        toDelete: oldRequests.length,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Cleaning up old webhook requests"
    );

    await concurrentExecutor(
      oldRequests,
      async (request) => {
        await request.delete(auth);
      },
      { concurrency: 16 }
    );

    const excessiveRequests = await this.baseFetch(auth, {
      order: [["createdAt", "DESC"]],
      offset: maxWebhookRequestsToKeep,
    });

    logger.info(
      {
        toDelete: excessiveRequests.length,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Cleaning up excessive webhook requests"
    );

    await concurrentExecutor(
      excessiveRequests,
      async (request) => {
        await request.delete(auth);
      },
      { concurrency: 16 }
    );
  }

  static getGcsPath({
    workspaceId,
    webhookSourceId,
    webRequestId,
  }: {
    workspaceId: string;
    webhookSourceId: ModelId;
    webRequestId: ModelId;
  }): string {
    return `${workspaceId}/webhook_source_${webhookSourceId}/webhook_request_${webRequestId}.json`;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      // Delete all triggers for this webhook request
      await WebhookRequestTriggerModel.destroy({
        where: {
          webhookRequestId: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

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

  static async deleteByWebhookSourceId(
    auth: Authenticator,
    webhookSourceId: ModelId,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<{ affectedCount: number }> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch only the IDs of webhook requests to minimize data transfer
    const webhookRequests = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        webhookSourceId,
      },
      attributes: ["id"],
      transaction,
    });

    // Delete all request triggers for these webhook requests
    await WebhookRequestTriggerModel.destroy({
      where: {
        workspaceId: workspace.id,
        webhookRequestId: webhookRequests.map((r) => r.id),
      },
      transaction,
    });

    // Delete all webhook requests for this webhook source
    const affectedCount = await this.model.destroy({
      where: {
        workspaceId: workspace.id,
        webhookSourceId,
      },
      transaction,
    });

    return { affectedCount };
  }
}
