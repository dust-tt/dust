import { EventError } from "@app/lib/api/llm/types/events";
import { z } from "zod";

const AnthropicErrorSchema = z.object({
  status: z.literal(400),
  error: z.object({
    error: z.object({
      type: z.literal("invalid_request_error"),
      message: z.string(),
    }),
  }),
});

const RequestToolsSchema = z.object({
  tools: z.array(z.object({ name: z.string() })),
});

/**
 * @cc [owner:philipperolet,label:error-handling] tool-schema-error-attribution
 * Only recognized tool-schema rejections may receive user-facing copy. Tool indices must resolve
 * against the sent request; unmatched errors retain their original handling and diagnostics.
 */
export function withToolSchemaErrorMessage(
  event: EventError,
  request: unknown,
  modelName: string
): EventError {
  if (
    event.metadata.clientId !== "anthropic" ||
    event.content.type !== "invalid_request_error"
  ) {
    return event;
  }

  const error = AnthropicErrorSchema.safeParse(event.content.originalError);
  const match = error.success
    ? /^tools\.(\d+)\.(?:custom\.)?input_schema\b/.exec(
        error.data.error.error.message
      )
    : null;
  if (!match) {
    return event;
  }

  const tools = RequestToolsSchema.safeParse(request);
  const tool = tools.success ? tools.data.tools[Number(match[1])] : undefined;
  if (!tool) {
    return event;
  }

  return new EventError(
    {
      ...event.content,
      userFacingMessage: `Anthropic rejected the input schema of tool "${tool.name}" for ${modelName}. Disable this tool or try a model from another provider.`,
    },
    event.metadata
  );
}
