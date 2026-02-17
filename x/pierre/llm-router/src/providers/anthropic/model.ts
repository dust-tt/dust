import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages.mjs";
import type { z } from "zod";

import type { configInputSchema } from "@/types/config";

export abstract class AnthropicModel<
  TConfigSchema extends z.ZodType<
    z.infer<typeof configInputSchema>
  > = z.ZodType<z.infer<typeof configInputSchema>>,
> {
  static modelId: string;
  protected static configSchema: z.ZodType<z.infer<typeof configInputSchema>>;

  get configJsonSchema(): Record<string, unknown> {
    return zodToJsonSchema(
      (this.constructor as typeof AnthropicModel).configSchema
    );
  }

  abstract toConfig(
    config: z.infer<TConfigSchema>
  ): Pick<
    MessageCreateParamsBase,
    "max_tokens" | "temperature" | "top_p" | "tools"
  >;
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Basic conversion from Zod schema to JSON Schema
  // This can be expanded based on needs or use a library like zod-to-json-schema
  return schema._def as Record<string, unknown>;
}
