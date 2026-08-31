// @vitest-environment node

import { DeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";
import { describe, expect, it } from "vitest";

describe("FireworksStream", () => {
  it("includes names when replaying parallel tool results", () => {
    const endpoint = new DeepSeekDeepSeekV4ProGlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      {
        conversation: {
          system: [],
          messages: [
            {
              role: "assistant",
              type: "tool_call_request",
              content: {
                callId: "call_1",
                toolName: "first_tool",
                arguments: "{}",
              },
            },
            {
              role: "assistant",
              type: "tool_call_request",
              content: {
                callId: "call_2",
                toolName: "second_tool",
                arguments: "{}",
              },
            },
            {
              role: "user",
              type: "tool_call_result",
              content: {
                callId: "call_1",
                toolName: "first_tool",
                parts: [{ type: "text", text: "first result" }],
                isError: false,
              },
            },
            {
              role: "user",
              type: "tool_call_result",
              content: {
                callId: "call_2",
                toolName: "second_tool",
                parts: [{ type: "text", text: "second result" }],
                isError: false,
              },
            },
          ],
        },
      },
      DeepSeekDeepSeekV4ProGlobalFireworksStream.configSchema.parse({})
    );

    expect(payload.messages).toContainEqual({
      role: "tool",
      name: "first_tool",
      tool_call_id: "call_1",
      content: "first result",
    });
    expect(payload.messages).toContainEqual({
      role: "tool",
      name: "second_tool",
      tool_call_id: "call_2",
      content: "second result",
    });
  });

  it("preserves optional tool parameters", () => {
    const endpoint = new DeepSeekDeepSeekV4ProGlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const inputSchema = {
      type: "object",
      properties: {
        query: { type: "string" },
        nextPageCursor: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    };
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      DeepSeekDeepSeekV4ProGlobalFireworksStream.configSchema.parse({
        tools: [
          {
            name: "search",
            description: "Search documents",
            inputSchema,
          },
        ],
      })
    );

    expect(payload.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Search documents",
          strict: true,
          parameters: inputSchema,
        },
      },
    ]);
  });
});
