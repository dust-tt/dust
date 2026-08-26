import type { InferenceRegionType } from "@app/lib/api/assistant/token_pricing";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import type { TokenUsage } from "@app/lib/api/llm/types/events";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { UsageType } from "@app/lib/metronome/types";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import type { RunUsageState } from "@app/lib/resources/storage/models/runs";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { getRunExecutionsDeletionCutoffDate } from "@app/temporal/hard_delete/utils";
import { isModelId } from "@app/types/assistant/models/models";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op, Sequelize } from "sequelize";

type RunResourceWithApp = RunResource & { app: AppModel };

export interface RunUsageType {
  completionTokens: number;
  // Provider-reported reasoning subset of completionTokens.
  reasoningTokens: number | null;
  modelId: ModelIdType;
  promptTokens: number;
  providerId: ModelProviderIdType;
  cachedTokens: number | null;
  // Optional: tokens spent writing to cache (e.g., Anthropic cache creation)
  cacheCreationTokens?: number | null;
  costMicroUsd: number;
  isBatch: boolean;
  serviceTier?: ServiceTier;
}

export interface RunUsageWithRunKeyType extends RunUsageType {
  inferenceProvider: string | null;
  region: Region | null;
  runKey: string | null;
  runUsageModelId: ModelId;
  runModelId: ModelId;
  usageType: UsageType | null;
}

export interface RunUsageAttemptType extends RunUsageType {
  inferenceProvider: string | null;
  region: Region | null;
  runUsageModelId: ModelId;
  usageState: RunUsageState | null;
  usageType: UsageType | null;
}

function runUsageAttributes(usage: RunUsageModel): RunUsageType {
  assert(isModelId(usage.modelId), `Unknown model id: ${usage.modelId}`);
  assert(
    isModelProviderId(usage.providerId),
    `Unknown model provider id: ${usage.providerId}`
  );

  return {
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    modelId: usage.modelId,
    promptTokens: usage.promptTokens,
    providerId: usage.providerId,
    cachedTokens: usage.cachedTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    costMicroUsd: usage.costMicroUsd,
    isBatch: usage.isBatch,
  };
}

interface PendingRunUsageParameters {
  inferenceProvider: string;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  region: Region | null;
  usageType: UsageType;
}

type FetchRunOptions<T extends boolean> = {
  includeApp?: T;
  since?: Date;
  order?: [string, "ASC" | "DESC"][];
  limit?: number;
  offset?: number;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RunResource extends ReadonlyAttributesType<RunModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RunResource extends BaseResource<RunModel> {
  static model: ModelStatic<RunModel> = RunModel;

  constructor(model: ModelStatic<RunModel>, blob: Attributes<RunModel>) {
    super(RunModel, blob);
  }

  static async makeNew(blob: CreationAttributes<RunModel>) {
    const run = await RunResource.model.create(blob);

    return new this(RunResource.model, run.get());
  }

  static async makeNewWithPendingUsage(
    blob: CreationAttributes<RunModel>,
    usage: PendingRunUsageParameters
  ): Promise<{ run: RunResource; runUsageModelId: ModelId }> {
    return withTransaction(async (transaction) => {
      const runModel = await RunResource.model.create(blob, { transaction });
      const runUsageModel = await RunUsageModel.create(
        {
          runId: runModel.id,
          workspaceId: blob.workspaceId,
          providerId: usage.providerId,
          inferenceProvider: usage.inferenceProvider,
          region: usage.region,
          modelId: usage.modelId,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: null,
          cachedTokens: null,
          cacheCreationTokens: null,
          costMicroUsd: 0,
          isBatch: false,
          serviceTier: "default",
          usageType: usage.usageType,
          usageState: "pending",
        },
        { transaction }
      );

      return {
        run: new this(RunResource.model, runModel.get()),
        runUsageModelId: runUsageModel.id,
      };
    });
  }

  private static getOptions<T extends boolean>(
    options?: FetchRunOptions<T>
  ): ResourceFindOptions<RunModel> {
    const result: ResourceFindOptions<RunModel> = {};

    if (options?.includeApp) {
      result.includes = [
        {
          model: AppModel,
          as: "app",
          required: true,
        },
      ];
    }

    if (options?.limit) {
      result.limit = options?.limit;
    }

    if (options?.offset) {
      result.offset = options.offset;
    }

    if (options?.since) {
      result.where = {
        createdAt: {
          [Op.gt]: options.since,
        },
      };
    }

    if (options?.order) {
      result.order = options.order;
    }

    return result;
  }

  static async listByWorkspace<T extends boolean>(
    workspace: LightWorkspaceType,
    options: FetchRunOptions<T>
  ): Promise<T extends true ? RunResourceWithApp[] : RunResource[]> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disabled error for unused includeDeleted
    const { where, includes, includeDeleted, ...opts } =
      this.getOptions(options);

    const runs = await this.model.findAll({
      where: {
        ...where,
        workspaceId: workspace.id,
      },
      include: includes,
      ...opts,
    });

    return runs.map((r) =>
      options.includeApp
        ? (new this(this.model, r.get()) as RunResourceWithApp)
        : (new this(this.model, r.get()) as RunResource)
    ) as T extends true ? RunResourceWithApp[] : RunResource[];
  }

  static async countByWorkspace(
    workspace: LightWorkspaceType,
    options?: Pick<FetchRunOptions<boolean>, "since">
  ) {
    const { where } = this.getOptions(options);

    return this.model.count({
      where: {
        ...where,
        workspaceId: workspace.id,
      },
    });
  }

  static async listByAppAndRunType(
    workspace: LightWorkspaceType,
    { appId, runType }: { appId: ModelId; runType: string | string[] },
    { limit, offset }: { limit?: number; offset?: number } = {}
  ): Promise<RunResource[]> {
    const where: WhereOptions<RunModel> = {
      appId,
      runType,
      workspaceId: workspace.id,
    };

    const runs = await this.model.findAll({
      where: addCreatedAtClause(where),
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return runs.map((r) => new this(this.model, r.get()));
  }

  static async listByDustRunIds(
    auth: Authenticator,
    { dustRunIds }: { dustRunIds: string[] }
  ) {
    const runs = await this.model.findAll({
      where: {
        dustRunId: { [Op.in]: dustRunIds },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return runs.map((r) => new this(this.model, r.get()));
  }

  // Tag an agent-loop execution's runs with their runKey so credit cost can be
  // ceiled per execution group (matching the Metronome billing partition).
  // Idempotent: a finalize retry recomputes the same key for the same runIds.
  static async setRunKeyForDustRunIds(
    auth: Authenticator,
    { dustRunIds, runKey }: { dustRunIds: string[]; runKey: string }
  ): Promise<void> {
    if (dustRunIds.length === 0) {
      return;
    }
    await this.model.update(
      { runKey },
      {
        where: {
          dustRunId: { [Op.in]: dustRunIds },
          workspaceId: auth.getNonNullableWorkspace().id,
          // The finalize and analytics paths both tag with the same deterministic key:
          // skip rows already tagged so repeat tagging does not rewrite identical rows.
          [Op.or]: [{ runKey: null }, { runKey: { [Op.ne]: runKey } }],
        },
      }
    );
  }

  // Classify legacy usage rows without ever changing an existing classification.
  static async setUsageTypeForRunsIfMissing(
    auth: Authenticator,
    { runs, usageType }: { runs: RunResource[]; usageType: UsageType }
  ): Promise<void> {
    const runModelIds = runs.map((run) => run.id);
    if (runModelIds.length === 0) {
      return;
    }
    await RunUsageModel.update(
      { usageType },
      {
        where: {
          runId: { [Op.in]: runModelIds },
          usageType: null,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );
  }

  static async listRunUsagesByModelIds(
    auth: Authenticator,
    {
      runUsageModelIds,
      transaction,
    }: { runUsageModelIds: ModelId[]; transaction?: Transaction }
  ): Promise<RunUsageWithRunKeyType[]> {
    if (runUsageModelIds.length === 0) {
      return [];
    }

    const usages = await RunUsageModel.findAll({
      where: {
        id: { [Op.in]: runUsageModelIds },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    const runs = await RunModel.findAll({
      attributes: ["id", "runKey"],
      where: {
        id: { [Op.in]: usages.map((usage) => usage.runId) },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    const runKeyByModelId = new Map<ModelId, string | null>(
      runs.map((run) => [run.id, run.runKey])
    );

    return usages.map((usage) => ({
      ...runUsageAttributes(usage),
      runUsageModelId: usage.id,
      runModelId: usage.runId,
      runKey: runKeyByModelId.get(usage.runId) ?? null,
      inferenceProvider: usage.inferenceProvider,
      region: usage.region,
      usageType: usage.usageType,
    }));
  }

  static async listRunUsagesForRuns(
    auth: Authenticator,
    {
      runs,
    }: {
      runs: RunResource[];
    }
  ): Promise<RunUsageWithRunKeyType[]> {
    const runModelIds = runs.map((run) => run.id);
    if (runModelIds.length === 0) {
      return [];
    }

    // runKey identifies the agent-loop execution a run belongs to, so callers
    // can group usages by execution (e.g. to ceil credit cost per the billed
    // Metronome partition).
    const runKeyByModelId = new Map<ModelId, string | null>(
      runs.map((run) => [run.id, run.runKey])
    );

    const usages = await RunUsageModel.findAll({
      where: {
        runId: { [Op.in]: runModelIds },
        workspaceId: auth.getNonNullableWorkspace().id,
        // Pending and unavailable attempts are reconciliation records, not
        // billable usage. Null supports rows written during rolling deploys.
        [Op.or]: [{ usageState: "reported" }, { usageState: null }],
      },
    });

    return usages.map((usage) => ({
      ...runUsageAttributes(usage),
      runUsageModelId: usage.id,
      runModelId: usage.runId,
      runKey: runKeyByModelId.get(usage.runId) ?? null,
      inferenceProvider: usage.inferenceProvider,
      region: usage.region,
      usageType: usage.usageType,
    }));
  }

  static async fetchByDustRunId(
    auth: Authenticator,
    { dustRunId }: { dustRunId: string }
  ): Promise<RunResource | null> {
    const run = await this.model.findOne({
      where: {
        dustRunId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    if (!run) {
      return null;
    }

    return new this(this.model, run.get());
  }

  static async countByAppAndRunType(
    workspace: LightWorkspaceType,
    { appId, runType }: { appId: ModelId; runType: string | string[] }
  ) {
    const where: WhereOptions<RunModel> = {
      appId,
      runType,
      workspaceId: workspace.id,
    };

    return this.model.count({
      where: addCreatedAtClause(where),
    });
  }

  static async deleteAllByAppId(appId: ModelId, transaction?: Transaction) {
    assert(typeof appId === "number");
    await RunUsageModel.destroy({
      where: {
        runId: {
          [Op.in]: Sequelize.literal(
            // Sequelize prevents other safer constructs due to typing with the destroy method.
            // `appId` cannot be user provided + assert above.
            `(SELECT id FROM runs WHERE "appId" = '${appId}')`
          ),
        },
      },
      transaction,
    });

    return this.model.destroy({
      where: {
        appId,
      },
      transaction,
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    assert(typeof workspace.id === "number");
    await RunUsageModel.destroy({
      where: {
        workspaceId: workspace.id,
        runId: {
          [Op.in]: Sequelize.literal(
            // Sequelize prevents other safer constructs due to typing with the destroy method.
            // `workspace.id` cannot cannot be user provided + assert above.
            `(SELECT id FROM runs WHERE "workspaceId" = '${workspace.id}')`
          ),
        },
      },
    });

    return this.model.destroy({
      where: { workspaceId: workspace.id },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      // Delete the run usage entry.
      await RunUsageModel.destroy({
        where: {
          runId: this.id,
        },
        transaction,
      });

      // Then, delete the run.
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * Run usage.
   */

  // Billing classification is immutable event-time metadata. Every new usage
  // row must be classified when it is created.
  async recordRunUsage(
    auth: Authenticator,
    usages: RunUsageType[],
    { usageType }: { usageType: UsageType }
  ) {
    await RunUsageModel.bulkCreate(
      usages.map(
        ({
          providerId,
          modelId,
          promptTokens,
          completionTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens,
          costMicroUsd,
          isBatch,
          serviceTier,
        }) => ({
          runId: this.id,
          workspaceId: this.workspaceId,
          providerId,
          inferenceProvider: null,
          region: null,
          modelId,
          promptTokens,
          completionTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens: cacheCreationTokens ?? null,
          costMicroUsd,
          isBatch,
          serviceTier: serviceTier ?? "default",
          usageType,
          usageState: "reported",
        })
      )
    );

    this.emitRunUsageMetrics(usages);
  }

  private emitRunUsageMetrics(usages: RunUsageType[]): void {
    for (const usage of usages) {
      const tags = [
        `provider_id:${usage.providerId}`,
        `model_id:${usage.modelId}`,
      ];

      statsDMetrics.increment(
        "run_usage.prompt_tokens",
        usage.promptTokens,
        tags
      );
      statsDMetrics.increment(
        "run_usage.completion_tokens",
        usage.completionTokens,
        tags
      );
      statsDMetrics.increment(
        "run_usage.cost_micro_usd",
        usage.costMicroUsd,
        tags
      );

      if (usage.cachedTokens) {
        statsDMetrics.increment(
          "run_usage.cached_tokens",
          usage.cachedTokens,
          tags
        );
      }
      if (usage.cacheCreationTokens) {
        statsDMetrics.increment(
          "run_usage.cache_creation_tokens",
          usage.cacheCreationTokens,
          tags
        );
      }
      if (usage.reasoningTokens) {
        statsDMetrics.increment(
          "run_usage.reasoning_tokens",
          usage.reasoningTokens,
          tags
        );
      }
    }
  }

  async recordTokenUsage(
    auth: Authenticator,
    usage: TokenUsage,
    modelId: ModelIdType,
    {
      isBatch = false,
      inferenceRegion = "global",
      usageType,
    }: {
      isBatch?: boolean;
      inferenceRegion?: InferenceRegionType;
      usageType: UsageType;
    }
  ) {
    const runUsage = this.tokenUsageToRunUsage(usage, modelId, {
      isBatch,
      inferenceRegion,
    });
    if (!runUsage) {
      return;
    }

    await this.recordRunUsage(auth, [runUsage], { usageType });

    // Return the computed cost so callers can meter it (e.g. the free-usage cost
    // cap). The result is undefined when the model is unknown and nothing was recorded.
    return runUsage.costMicroUsd;
  }

  async markPendingRunUsageUnavailable(
    auth: Authenticator,
    runUsageModelId: ModelId
  ): Promise<void> {
    await RunUsageModel.update(
      { usageState: "unavailable" },
      {
        where: {
          id: runUsageModelId,
          runId: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          usageState: "pending",
        },
      }
    );
  }

  async finalizePendingRunUsage(
    auth: Authenticator,
    runUsageModelId: ModelId,
    usages: RunUsageType[]
  ): Promise<boolean> {
    const [firstUsage, ...additionalUsages] = usages;
    if (!firstUsage) {
      return false;
    }

    const [updatedCount, updatedUsages] = await RunUsageModel.update(
      {
        providerId: firstUsage.providerId,
        modelId: firstUsage.modelId,
        promptTokens: firstUsage.promptTokens,
        completionTokens: firstUsage.completionTokens,
        reasoningTokens: firstUsage.reasoningTokens,
        cachedTokens: firstUsage.cachedTokens,
        cacheCreationTokens: firstUsage.cacheCreationTokens ?? null,
        costMicroUsd: firstUsage.costMicroUsd,
        isBatch: firstUsage.isBatch,
        serviceTier: firstUsage.serviceTier ?? "default",
        usageState: "reported",
      },
      {
        returning: true,
        where: {
          id: runUsageModelId,
          runId: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          usageState: "pending",
        },
      }
    );

    // Provider streams report usage once. Treat repeated finalization as an
    // idempotent replay instead of inserting duplicate billable rows.
    if (updatedCount === 0) {
      return false;
    }

    if (additionalUsages.length > 0) {
      const usageType = updatedUsages[0]?.usageType;
      if (!usageType) {
        throw new Error(
          "Cannot record additional usage for a run without a billing classification"
        );
      }
      await this.recordRunUsage(auth, additionalUsages, { usageType });
    }
    this.emitRunUsageMetrics([firstUsage]);
    return true;
  }

  async finalizePendingTokenUsage(
    auth: Authenticator,
    runUsageModelId: ModelId,
    usage: TokenUsage,
    modelId: ModelIdType,
    {
      inferenceRegion = "global",
    }: {
      inferenceRegion?: InferenceRegionType;
    } = {}
  ): Promise<number | undefined> {
    const runUsage = this.tokenUsageToRunUsage(usage, modelId, {
      isBatch: false,
      inferenceRegion,
    });
    if (!runUsage) {
      return undefined;
    }

    const wasFinalized = await this.finalizePendingRunUsage(
      auth,
      runUsageModelId,
      [runUsage]
    );
    return wasFinalized ? runUsage.costMicroUsd : undefined;
  }

  private tokenUsageToRunUsage(
    usage: TokenUsage,
    modelId: ModelIdType,
    {
      isBatch,
      inferenceRegion,
    }: {
      isBatch: boolean;
      inferenceRegion: InferenceRegionType;
    }
  ): RunUsageType | null {
    const modelConfig = getModelConfigByModelId(modelId);

    if (!modelConfig) {
      logger.warn({ modelId }, "Unsupported model for usage recording");

      return null;
    }

    // totalOutputTokens is the canonical inclusive billed output total. Any
    // reasoningTokens value is already a subset and must not be added here.
    const usageCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      modelId: modelConfig.modelId,
      promptTokens: usage.inputTokens,
      completionTokens: usage.totalOutputTokens,
      cachedTokens: usage.cachedTokens ?? null,
      cacheCreationTokens: usage.cacheCreationTokens ?? null,
      longCacheCreationTokens: usage.longCacheCreationTokens ?? null,
      isBatch,
      serviceTier: usage.serviceTier,
      inferenceRegion,
    });

    return {
      cacheCreationTokens: usage.cacheCreationTokens,
      cachedTokens: usage.cachedTokens ?? null,
      completionTokens: usage.totalOutputTokens,
      reasoningTokens: usage.reasoningTokens ?? null,
      modelId: modelConfig.modelId,
      promptTokens: usage.inputTokens,
      providerId: modelConfig.providerId,
      // Token pricing can produce fractional micro-dollar values. Run usage stores a BIGINT, so
      // normalize explicitly instead of relying on coercion that differs between inserts and updates.
      costMicroUsd: Math.round(usageCostMicroUsd),
      isBatch,
      serviceTier: usage.serviceTier ?? "default",
    };
  }

  async listRunUsages(auth: Authenticator): Promise<RunUsageType[]> {
    const usages = await RunResource.listRunUsagesForRuns(auth, {
      runs: [this],
    });

    return usages.map(({ runModelId, ...usage }) => usage);
  }

  async listRunUsageAttempts(
    auth: Authenticator
  ): Promise<RunUsageAttemptType[]> {
    const usages = await RunUsageModel.findAll({
      where: {
        runId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["id", "ASC"]],
    });

    return usages.map((usage) => ({
      ...runUsageAttributes(usage),
      runUsageModelId: usage.id,
      inferenceProvider: usage.inferenceProvider,
      region: usage.region,
      usageType: usage.usageType,
      usageState: usage.usageState,
    }));
  }
}

// Runs are not deleted from front but may no longer exist in core.
// Apply the cutoff date at runtime.
function addCreatedAtClause(where: WhereOptions<RunModel>) {
  return {
    ...where,
    createdAt: { [Op.gt]: getRunExecutionsDeletionCutoffDate() },
  };
}
