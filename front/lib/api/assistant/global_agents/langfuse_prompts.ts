import { getLangfuseClient } from "@app/lib/api/langfuse_client";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  type AgentReasoningEffort,
  AgentReasoningEffortSchema,
  clampReasoningEffort,
} from "@app/types/assistant/agent";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

type LangfuseFirstMessagePromptName =
  | "copilot-edge-first-message-existing"
  | "copilot-edge-first-message-template"
  | "copilot-edge-first-message-shrink-wrap";

type LangfuseSystemPromptName = "copilot-edge";

const LangfuseModelConfigSchema = z.object({
  modelId: z.string(),
  reasoningEffort: AgentReasoningEffortSchema.optional(),
});

export interface LangfusePromptConfig {
  instructions: string;
  modelConfig: ModelConfigurationType;
  reasoningEffort?: AgentReasoningEffort;
}

export async function fetchLangfuseFirstMessagePrompt(
  promptName: LangfuseFirstMessagePromptName,
  variables: Record<string, string>
): Promise<Result<string, Error>> {
  const client = getLangfuseClient();
  if (!client) {
    return new Err(new Error("Langfuse is not enabled"));
  }

  try {
    const prompt = await client.prompt.get(promptName);
    return new Ok(prompt.compile(variables));
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function fetchLangfuseSystemPromptConfig(
  promptName: LangfuseSystemPromptName,
  variables: Record<string, string>
): Promise<Result<LangfusePromptConfig, Error>> {
  const client = getLangfuseClient();
  if (!client) {
    return new Err(new Error("Langfuse is not enabled"));
  }

  try {
    const prompt = await client.prompt.get(promptName, {
      // In development, we want to avoid caching prompts to ensure we always get the latest version.
      cacheTtlSeconds: isDevelopment() ? 0 : undefined,
    });
    const instructions = prompt.compile(variables);
    const parsedConfig = LangfuseModelConfigSchema.parse(prompt.config);

    const modelConfig = getModelConfigByModelId(parsedConfig.modelId);
    if (!modelConfig) {
      return new Err(
        new Error(
          `Unknown modelId in Langfuse config: "${parsedConfig.modelId}"`
        )
      );
    }

    return new Ok({
      instructions,
      modelConfig,
      reasoningEffort: parsedConfig.reasoningEffort
        ? clampReasoningEffort(
            parsedConfig.reasoningEffort,
            modelConfig.minimumReasoningEffort,
            modelConfig.maximumReasoningEffort
          )
        : undefined,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
