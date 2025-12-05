import { z } from "zod";

import { getLLM } from "@app/lib/api/llm";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import type { ModelIdType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

interface LLMConfig {
  functionCall?: string | null;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature?: number;
  useCache?: boolean;
  useStream?: boolean;
}

interface LLMOptions {
  tracingRecords?: Record<string, string>;
  context?: LLMTraceContext;
}

// Zod schema to validate runActionStreamed output.
const _LLMOutputSchema = z.object({
  actions: z
    .array(
      z.object({
        name: z.string(),
        functionCallId: z.string().optional(),
        arguments: z.record(z.any()),
      })
    )
    .optional(),
  generation: z.string().nullable().optional(),
});

type LLMOutput = z.infer<typeof _LLMOutputSchema>;

/**
 * Temporary wrapper around assistant-v2-multi-actions-agent Dust app to consolidate LLM interactions.
 * This provides a unified interface for calling LLMs while we transition away from individual Dust
 * apps. Once we have the direct LLM router ready, this wrapper will be fully removed.
 */
export async function runMultiActionsAgent(
  auth: Authenticator,
  config: LLMConfig,
  input: LLMStreamParameters,
  options: LLMOptions = {}
): Promise<Result<LLMOutput, Error>> {
  const llm = await getLLM(auth, {
    modelId: config.modelId,
    temperature: config.temperature,
    context: options.context,
  });

  if (!llm) {
    // Should not happen
    return new Err(new Error(`Model ${config.modelId} not supported`));
  }

  const actions: NonNullable<LLMOutput["actions"]> = [];
  let generation = "";

  for await (const event of llm.stream(input)) {
    if (event.type === "error") {
      return new Err(new Error(`LLM error: ${event.content.message}`));
    }

    if (event.type === "text_generated") {
      generation += event.content.text;
    }

    if (event.type === "tool_call") {
      actions.push({
        name: event.content.name,
        functionCallId: event.content.id,
        arguments: event.content.arguments,
      });
    }
  }

  return new Ok({ actions, generation });
}
