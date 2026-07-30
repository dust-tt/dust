import type { Authenticator } from "@app/lib/auth";
import { RunResource } from "@app/lib/resources/run_resource";
import { RunUsageModel } from "@app/lib/resources/storage/models/runs";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelIdType } from "@app/types/assistant/models/types";

export class RunFactory {
  static async createWithUsage(
    auth: Authenticator,
    {
      inputTokens = 100,
      outputTokens = 20,
      reasoningTokens,
      modelId = GPT_5_MINI_MODEL_CONFIG.modelId,
    }: {
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      modelId?: ModelIdType;
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
        totalTokens: inputTokens + outputTokens,
      },
      modelId
    );

    const runUsage = await RunUsageModel.findOne({
      where: { runId: run.id, workspaceId: workspace.id },
    });
    if (!runUsage) {
      throw new Error("Run usage not found after recording token usage");
    }

    return { run, runUsageModelId: runUsage.id };
  }
}
