import type { Authenticator } from "@app/lib/auth";
import type { WebhookRequestStatus } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  TriggerType,
  WebhookRequestTriggerStatus,
} from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn, literal, Op, QueryTypes } from "sequelize";

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

  /**
   * Fetch webhook request triggers for a given trigger ID, including the associated
   * webhook request data. Used for displaying recent webhook request history.
   */
  static async listForTriggerId(
    auth: Authenticator,
    {
      triggerId,
      limit,
      status,
    }: {
      triggerId: ModelId;
      limit?: number;
      status?: WebhookRequestTriggerStatus;
    }
  ) {
    const workspace = auth.getNonNullableWorkspace();

    return WebhookRequestTriggerModel.findAll({
      where: {
        workspaceId: workspace.id,
        triggerId,
        ...(status ? { status } : {}),
      },
      include: [
        {
          model: WebhookRequestModel,
          as: "webhookRequest",
          required: true,
          attributes: ["id", "createdAt", "webhookSourceId"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
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
    // biome-ignore lint/plugin/noRawSql: automatic suppress
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

  /**
   * Count webhook requests for a source across multiple time periods.
   */
  static async countBySourceInPeriods(
    auth: Authenticator,
    webhookSourceModelId: ModelId
  ): Promise<{ last24h: number; last7d: number; last30d: number }> {
    const workspace = auth.getNonNullableWorkspace();
    const where = {
      workspaceId: workspace.id,
      webhookSourceId: webhookSourceModelId,
    };

    const [last24h, last7d, last30d] = await Promise.all([
      WebhookRequestModel.count({
        where: {
          ...where,
          createdAt: { [Op.gt]: literal("NOW() - interval '24 hour'") },
        },
      }),
      WebhookRequestModel.count({
        where: {
          ...where,
          createdAt: { [Op.gt]: literal("NOW() - interval '7 day'") },
        },
      }),
      WebhookRequestModel.count({
        where: {
          ...where,
          createdAt: { [Op.gt]: literal("NOW() - interval '30 day'") },
        },
      }),
    ]);

    return { last24h, last7d, last30d };
  }

  /**
   * Get execution stats for a trigger: status breakdown and daily volume (last 30 days).
   */
  static async getExecutionStatsForTrigger(
    auth: Authenticator,
    triggerModelId: ModelId
  ): Promise<{
    statusBreakdown: Record<string, number>;
    dailyVolume: Array<{
      date: string;
      succeeded: number;
      failed: number;
      notMatched: number;
      rateLimited: number;
    }>;
  }> {
    const workspace = auth.getNonNullableWorkspace();

    // Status breakdown.
    const statusRows = await WebhookRequestTriggerModel.findAll({
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      where: {
        workspaceId: workspace.id,
        triggerId: triggerModelId,
      },
      group: ["status"],
      raw: true,
    });

    const statusBreakdown: Record<string, number> = {};
    for (const row of statusRows) {
      statusBreakdown[row.status] = Number(
        (row as unknown as { count: string }).count
      );
    }

    // Daily volume grouped by status (last 30 days).
    const dailyRows = await WebhookRequestTriggerModel.findAll({
      attributes: [
        [fn("DATE", col("createdAt")), "date"],
        "status",
        [fn("COUNT", col("id")), "count"],
      ],
      where: {
        workspaceId: workspace.id,
        triggerId: triggerModelId,
        createdAt: {
          [Op.gt]: literal("NOW() - interval '30 day'"),
        },
      },
      group: [fn("DATE", col("createdAt")), "status"],
      order: [[fn("DATE", col("createdAt")), "DESC"]],
      raw: true,
    });

    // Aggregate rows by date into per-status counts.
    const dailyMap = new Map<
      string,
      {
        succeeded: number;
        failed: number;
        notMatched: number;
        rateLimited: number;
      }
    >();
    for (const row of dailyRows) {
      const { status } = row;
      const date = (row as unknown as { date: string }).date;
      const count = Number((row as unknown as { count: string }).count);

      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          succeeded: 0,
          failed: 0,
          notMatched: 0,
          rateLimited: 0,
        });
      }
      const entry = dailyMap.get(date)!;
      switch (status) {
        case "workflow_start_succeeded":
          entry.succeeded += count;
          break;
        case "workflow_start_failed":
          entry.failed += count;
          break;
        case "not_matched":
          entry.notMatched += count;
          break;
        case "rate_limited":
          entry.rateLimited += count;
          break;
      }
    }

    const dailyVolume = Array.from(dailyMap.entries()).map(
      ([date, counts]) => ({
        date,
        ...counts,
      })
    );

    return {
      statusBreakdown,
      dailyVolume,
    };
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
