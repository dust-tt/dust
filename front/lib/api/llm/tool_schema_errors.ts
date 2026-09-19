import { EventError } from "@app/lib/api/llm/types/events";

/**
 * @cc [owner:philipperolet,label:error-handling] tool-schema-error-attribution
 * Only recognized tool-schema rejections may receive user-facing copy. The
 * rejected tool is named by the endpoint, which resolved it against the request
 * it sent; unattributed errors retain their original handling and diagnostics.
 */
export function withToolSchemaErrorMessage(
  event: EventError,
  modelName: string
): EventError {
  const { rejectedToolName } = event.content;
  if (!rejectedToolName) {
    return event;
  }

  return new EventError(
    {
      ...event.content,
      userFacingMessage: `Anthropic rejected the input schema of tool "${rejectedToolName}" for ${modelName}. Disable this tool or try a model from another provider.`,
    },
    event.metadata
  );
}
