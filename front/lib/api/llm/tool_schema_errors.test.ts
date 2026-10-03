import { APIError } from "@anthropic-ai/sdk";
import { withToolSchemaErrorMessage } from "@app/lib/api/llm/tool_schema_errors";
import { convertToOldEvent } from "@app/lib/api/llm/transitionLLM";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { toolSpecsToAnthropicAITools } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { streamErrorToErrorEvent } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import { assert, describe, expect, it } from "vitest";

const metadata: LLMClientMetadata = {
  clientId: "anthropic",
  inferenceProvider: "agent-platform",
  inferenceRegion: "eu",
  modelId: "claude-sonnet-5",
};

function schemaError(message: string, toolNames?: string[]) {
  const error = new APIError(
    400,
    { type: "error", error: { type: "invalid_request_error", message } },
    message,
    undefined,
    "invalid_request_error"
  );
  const event = convertToOldEvent(
    streamErrorToErrorEvent(
      {
        lab: "anthropic",
        host: "agent-platform",
        region: "eu",
        model: "claude-sonnet-5",
      },
      error,
      toolNames
    ),
    metadata
  );
  assert(event?.type === "error");
  return event;
}

function sentToolNames(toolSearchEnabled: boolean): string[] {
  return toolSpecsToAnthropicAITools(
    [
      {
        name: "create_custom_field",
        description: "Create a custom field.",
        inputSchema: { type: "object", anyOf: [{ type: "object" }] },
      },
    ],
    { forceTool: undefined, toolSearchEnabled }
  ).map((tool) => tool.name);
}

describe("withToolSchemaErrorMessage", () => {
  it.each([
    { toolSearchEnabled: false, path: "tools.0.input_schema" },
    { toolSearchEnabled: true, path: "tools.1.custom.input_schema" },
  ])("names the rejected tool with tool search $toolSearchEnabled", ({
    toolSearchEnabled,
    path,
  }) => {
    const event = schemaError(
      `${path}: input_schema does not support oneOf, allOf, or anyOf at the top level`,
      sentToolNames(toolSearchEnabled)
    );

    const result = withToolSchemaErrorMessage(event, "Claude Sonnet 5");

    expect(result.content.userFacingMessage).toBe(
      'Anthropic rejected the input schema of tool "create_custom_field" for Claude Sonnet 5. Disable this tool or try a model from another provider.'
    );
    expect(result.content.originalError).toBe(event.content.originalError);
    expect(result.content.message).toBe(event.content.message);
    expect(result.content.isRetryable).toBe(false);
  });

  it.each([
    "messages.0.content: invalid content",
    "tools.0.name: invalid tool name",
    "tools.9.input_schema: invalid schema",
  ])("keeps the original handling when attribution fails: %s", (message) => {
    const event = schemaError(message, ["create_custom_field"]);
    expect(withToolSchemaErrorMessage(event, "Claude Sonnet 5")).toBe(event);
  });

  it("keeps the original handling when the request sent no tools", () => {
    const event = schemaError("tools.0.input_schema: invalid schema");
    expect(withToolSchemaErrorMessage(event, "Claude Sonnet 5")).toBe(event);
  });
});
