// @vitest-environment node

import { DeepSeekDeepSeekV4Flash0731GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_flash_0731_global_fireworks";
import { ZAiGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_two_global_fireworks";
import { describe, expect, it } from "vitest";

describe("FireworksStream", () => {
  it("preserves optional tool parameters for DeepSeek V4 Flash", () => {
    const endpoint = new DeepSeekDeepSeekV4Flash0731GlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      DeepSeekDeepSeekV4Flash0731GlobalFireworksStream.configSchema.parse({
        tools: [
          {
            name: "search",
            description: "Search for documents",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "number" },
              },
              required: ["query"],
              additionalProperties: false,
            },
          },
        ],
      })
    );

    const tool = payload.tools?.[0];
    if (tool?.type !== "function") {
      throw new Error("Expected a function tool");
    }
    expect(tool.function.parameters?.required).toEqual(["query"]);
  });

  it("includes names when replaying parallel tool results", () => {
    const endpoint = new ZAiGlmFiveDotTwoGlobalFireworksStream({
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
      ZAiGlmFiveDotTwoGlobalFireworksStream.configSchema.parse({})
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
});
