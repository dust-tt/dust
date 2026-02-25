import { getLangfuseClient } from "@app/lib/api/langfuse_client";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  type AgentReasoningEffort,
  AgentReasoningEffortSchema,
  clampReasoningEffort,
} from "@app/types/assistant/agent";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { z } from "zod";

const LangfuseModelConfigSchema = z.object({
  modelId: z.string().optional(),
  reasoningEffort: AgentReasoningEffortSchema.optional(),
});

export interface LangfusePromptConfig {
  instructions: string;
  modelConfig: ModelConfigurationType | null;
  reasoningEffort?: AgentReasoningEffort;
}

// Best-effort: returns null if config is missing, malformed, or references an unknown model.
function resolveModelConfig(rawConfig: unknown): {
  modelConfig: ModelConfigurationType;
  reasoningEffort?: AgentReasoningEffort;
} | null {
  const parsed = LangfuseModelConfigSchema.safeParse(rawConfig);
  if (!parsed.success || !parsed.data.modelId) {
    return null;
  }

  const modelConfig = getModelConfigByModelId(parsed.data.modelId);
  if (!modelConfig) {
    return null;
  }

  return {
    modelConfig,
    reasoningEffort: parsed.data.reasoningEffort
      ? clampReasoningEffort(
          parsed.data.reasoningEffort,
          modelConfig.minimumReasoningEffort,
          modelConfig.maximumReasoningEffort
        )
      : undefined,
  };
}

export async function fetchLangfusePromptConfig(
  promptName: string,
  variables: Record<string, string>
): Promise<Result<LangfusePromptConfig, Error>> {
  try {
    const client = getLangfuseClient();
    assert(client, "Langfuse is not enabled");

    const prompt = await client.prompt.get(promptName);
    const instructions = prompt.compile(variables);
    const resolved = resolveModelConfig(prompt.config);

    return new Ok({
      instructions,
      modelConfig: resolved?.modelConfig ?? null,
      reasoningEffort: resolved?.reasoningEffort,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
