// @vitest-environment node

import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { describe, expect, it } from "vitest";

const TOOLS = [
  {
    name: "calculator",
    description: "Calculate an expression",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "get_weather",
    description: "Get the weather",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
      additionalProperties: false,
    },
  },
];

describe("FireworksResponsesStream", () => {
  it("replays reasoning and tool calls as Responses input items", () => {
    const endpoint = new MoonshotAiKimiK3GlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      {
        conversation: {
          system: [
            {
              role: "system",
              type: "text",
              content: { value: "Be concise." },
            },
          ],
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "What is 2 + 3?" },
            },
            {
              role: "assistant",
              type: "reasoning",
              content: { value: "I should use the calculator." },
              signature: "rs_123",
            },
            {
              role: "assistant",
              type: "tool_call_request",
              content: {
                callId: "call_123",
                toolName: "calculator",
                arguments: '{"expression":"2 + 3"}',
              },
            },
            {
              role: "user",
              type: "tool_call_result",
              content: {
                callId: "call_123",
                toolName: "calculator",
                parts: [{ type: "text", text: "5" }],
                isError: false,
              },
            },
          ],
        },
      },
      MoonshotAiKimiK3GlobalFireworksStream.configSchema.parse({ tools: TOOLS })
    );

    expect(payload).toMatchObject({
      model: "accounts/fireworks/models/kimi-k3",
      service_tier: "priority",
      store: false,
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: "Be concise." }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "What is 2 + 3?" }],
        },
        {
          id: "rs_123",
          type: "reasoning",
          summary: [
            {
              type: "summary_text",
              text: "I should use the calculator.",
            },
          ],
        },
        {
          type: "function_call",
          call_id: "call_123",
          name: "calculator",
          arguments: '{"expression":"2 + 3"}',
        },
        {
          type: "function_call_output",
          call_id: "call_123",
          output: "5",
        },
      ],
    });
  });

  it("forces a function using the Fireworks-compatible tool choice", () => {
    const endpoint = new MoonshotAiKimiK3GlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      MoonshotAiKimiK3GlobalFireworksStream.configSchema.parse({
        tools: TOOLS,
        forceTool: "calculator",
      })
    );

    expect(payload.tool_choice).toBe("required");
    expect(payload.tools).toEqual([
      expect.objectContaining({ type: "function", name: "calculator" }),
    ]);
  });

  it("does not send OpenAI hosted tool search fields to Fireworks", () => {
    const endpoint = new MoonshotAiKimiK3GlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      MoonshotAiKimiK3GlobalFireworksStream.configSchema.parse({
        tools: TOOLS.map((tool) => ({ ...tool, eager: false })),
        toolSearchEnabled: true,
      })
    );

    expect(payload.tools).toHaveLength(2);
    expect(payload.tools).toEqual([
      expect.not.objectContaining({ defer_loading: expect.anything() }),
      expect.not.objectContaining({ defer_loading: expect.anything() }),
    ]);
  });
});
