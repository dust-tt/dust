import type { ResponseCreateParamsBase } from "openai/resources/responses/responses.mjs";
import type { z } from "zod";

import type { configInputSchema } from "@/types/config";

export abstract class OpenAIModel<
  TConfigSchema extends z.ZodType<
    z.infer<typeof configInputSchema>
  > = z.ZodType<z.infer<typeof configInputSchema>>,
> {
  static modelId: string;
  protected static configSchema: z.ZodType<z.infer<typeof configInputSchema>>;

  get configJsonSchema(): Record<string, unknown> {
    return zodToJsonSchema(
      (this.constructor as typeof OpenAIModel).configSchema
    );
  }

  abstract toConfig(
    config: z.infer<TConfigSchema>
  ): Pick<
    ResponseCreateParamsBase,
    "max_output_tokens" | "reasoning" | "temperature" | "top_p"
  >;
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Basic conversion from Zod schema to JSON Schema
  // This can be expanded based on needs or use a library like zod-to-json-schema
  return schema._def as Record<string, unknown>;
}
