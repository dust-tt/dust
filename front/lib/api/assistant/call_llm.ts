import { z } from "zod";
import { fromError } from "zod-validation-error";

import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export interface LLMConfig {
  functionCall?: string | null;
  modelId: string;
  promptCaching?: boolean;
  providerId: string;
  reasoningEffort?: string;
  responseFormat?: string;
  temperature?: number;
  useCache?: boolean;
  useStream?: boolean;
}

export interface LLMInput {
  conversation: unknown;
  prompt: string;
  specifications?: Array<{
    name: string;
    description: string;
    inputSchema: any;
  }>;
}

export interface LLMOptions {
  tracingRecords?: Record<string, string>;
}

// Zod schema to validate runActionStreamed output.
const LLMOutputSchema = z.object({
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

export type LLMOutput = z.infer<typeof LLMOutputSchema>;

/**
 * Temporary wrapper around assistant-v2-multi-actions-agent Dust app to consolidate LLM interactions.
 * This provides a unified interface for calling LLMs while we transition away from individual Dust
 * apps. Once we have the direct LLM router ready, this wrapper will be fully removed.
 */
export async function runMultiActionsAgent(
  auth: Authenticator,
  config: LLMConfig,
  input: LLMInput,
  options: LLMOptions = {}
): Promise<Result<LLMOutput, Error>> {
  // Clone base config and apply overrides.
  const runConfig = cloneBaseConfig(
    getDustProdAction("assistant-v2-multi-actions-agent").config
  );

  // Override model configuration.
  runConfig.MODEL.provider_id = config.providerId;
  runConfig.MODEL.model_id = config.modelId;
  runConfig.MODEL.temperature = config.temperature ?? 0;
  runConfig.MODEL.function_call = config.functionCall ?? null;
  runConfig.MODEL.use_cache = config.useCache ?? false;
  runConfig.MODEL.use_stream = config.useStream ?? true;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-multi-actions-agent",
    runConfig,
    [input],
    options.tracingRecords ?? {}
  );

  if (res.isErr()) {
    return new Err(new Error(`LLM execution failed: ${res.error.message}`));
  }

  const { eventStream } = res.value;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(new Error(`LLM error: ${event.content.message}`));
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Block execution error: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const parseResult = LLMOutputSchema.safeParse(e.value);
        if (!parseResult.success) {
          logger.error(
            {
              error: fromError(parseResult.error).toString(),
            },
            "Invalid LLM output schema"
          );

          return new Err(
            new Error(`Invalid LLM output schema: ${parseResult.error.message}`)
          );
        }

        return new Ok(parseResult.data);
      }
    }
  }

  return new Err(new Error("No output found in LLM response"));
}
