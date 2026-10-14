import type { Authenticator } from "@app/lib/auth";
import { USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import type { UsageType } from "@app/lib/metronome/types";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import { RunResource } from "@app/lib/resources/run_resource";
import { RunUsageModel } from "@app/lib/resources/storage/models/runs";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ModelIdType,
} from "@app/types/assistant/models/types";

// gpt-5-mini tokens worth exactly one credit, the default model of `createWithUsage`.
export const GPT_5_MINI_TOKENS_PER_CREDIT = {
  input: 34_000,
  cachedInput: 340_000,
  output: 4_250,
};

export class RunFactory {
  static async createWithUsage(
    auth: Authenticator,
    {
      inputTokens = 100,
      outputTokens = 20,
      reasoningTokens,
      cachedTokens,
      cacheCreationTokens,
      modelId = GPT_5_MINI_MODEL_CONFIG.modelId,
      usageType = USAGE_TYPE_USER,
      serviceTier,
      retiredModel,
    }: {
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      cachedTokens?: number;
      cacheCreationTokens?: number;
      modelId?: ModelIdType;
      usageType?: UsageType | null;
      serviceTier?: ServiceTier;
      retiredModel?: ModelConfigurationType;
    } = {}
  ) {
    const workspace = auth.getNonNullableWorkspace();
    const run = await RunResource.makeNew({
      appId: null,
      dustRunId: generateRandomModelSId(),
      runType: "deploy",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });
    await run.recordTokenUsage(
      auth,
      {
        inputTokens,
        totalOutputTokens: outputTokens,
        reasoningTokens,
        cachedTokens,
        cacheCreationTokens,
        totalTokens: inputTokens + outputTokens,
        serviceTier,
      },
      modelId,
      {
        region: null,
        usageType: usageType ?? USAGE_TYPE_USER,
        useWorkspaceCredentials: false,
      }
    );

    const runUsage = await RunUsageModel.findOne({
      where: { runId: run.id, workspaceId: workspace.id },
    });
    if (!runUsage) {
      throw new Error("Run usage not found after recording token usage");
    }
    if (usageType === null) {
      await RunUsageModel.update(
        { usageType: null },
        { where: { id: runUsage.id, workspaceId: workspace.id } }
      );
    }
    if (retiredModel) {
      await RunUsageModel.update(
        {
          providerId: retiredModel.providerId,
          modelId: retiredModel.modelId,
        },
        { where: { id: runUsage.id, workspaceId: workspace.id } }
      );
    }

    return { run, runUsageModelId: runUsage.id };
  }

  // A model call still in flight: its usage row is pending, with no tokens and no cost.
  static async createWithPendingUsage(auth: Authenticator) {
    return RunResource.makeNewWithPendingUsage(
      {
        appId: null,
        dustRunId: generateRandomModelSId(),
        runType: "deploy",
        useWorkspaceCredentials: false,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      {
        inferenceProvider: GPT_5_MINI_MODEL_CONFIG.providerId,
        modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
        providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
        reasoningEffort: GPT_5_MINI_MODEL_CONFIG.defaultReasoningEffort,
        region: null,
        usageType: USAGE_TYPE_USER,
        useWorkspaceCredentials: false,
      }
    );
  }

  // A model call whose provider stream ended without reporting usage: its pending usage row is
  // closed as unavailable, with no tokens and no cost.
  static async createWithUnavailableUsage(auth: Authenticator) {
    const { run, runUsageModelId } = await this.createWithPendingUsage(auth);
    await run.markPendingRunUsageUnavailable(auth, runUsageModelId);

    return { run, runUsageModelId };
  }
}
