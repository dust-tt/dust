import type { InferenceRegionType } from "@app/lib/api/assistant/token_pricing";
import type { TokenUsage } from "@app/lib/api/llm/types/events";
import type { Authenticator } from "@app/lib/auth";
import type { UsageType } from "@app/lib/metronome/types";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";

interface LLMRunLifecycleParameters {
  dustRunId: string;
  inferenceProvider: string;
  inferenceRegion: InferenceRegionType;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  region: Region | null;
  usageType: UsageType;
}

/**
 * Durable lifecycle for one non-batch LLM inference.
 *
 * Starting atomically creates the run and a pending usage row. Closing without reported usage marks
 * the attempt unavailable instead of silently losing it or treating it as zero-cost usage.
 */
export class LLMRunLifecycle {
  private constructor(
    private readonly auth: Authenticator,
    private readonly run: RunResource,
    private readonly runUsageModelId: ModelId,
    private readonly parameters: LLMRunLifecycleParameters
  ) {}

  static async start(
    auth: Authenticator,
    parameters: LLMRunLifecycleParameters
  ): Promise<LLMRunLifecycle> {
    const { run, runUsageModelId } = await RunResource.makeNewWithPendingUsage(
      {
        appId: null,
        dustRunId: parameters.dustRunId,
        runType: "deploy",
        useWorkspaceCredentials: false,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      {
        inferenceProvider: parameters.inferenceProvider,
        modelId: parameters.modelId,
        providerId: parameters.providerId,
        region: parameters.region,
        usageType: parameters.usageType,
      }
    );

    return new this(auth, run, runUsageModelId, parameters);
  }

  async recordTokenUsage(usage: TokenUsage): Promise<number | undefined> {
    return this.run.finalizePendingTokenUsage(
      this.auth,
      this.runUsageModelId,
      usage,
      this.parameters.modelId,
      {
        inferenceRegion: this.parameters.inferenceRegion,
      }
    );
  }

  async recordRunUsages(usages: RunUsageType[]): Promise<void> {
    await this.run.finalizePendingRunUsage(
      this.auth,
      this.runUsageModelId,
      usages
    );
  }

  async close(): Promise<void> {
    await this.run.markPendingRunUsageUnavailable(
      this.auth,
      this.runUsageModelId
    );
  }
}
