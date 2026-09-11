import type { ContentBlockConverters } from "@app/lib/model_constructors/sdk/google_genai/converters/input/utils";
import {
  assistantReasoningMessageToPart,
  assistantTextMessageToPart,
  assistantToolCallRequestToPart,
  conversationToContents,
  systemMessageToPart,
  toolCallResultMessageToContent,
  userImageMessageToPart,
  userTextMessageToPart,
} from "@app/lib/model_constructors/sdk/google_genai/converters/input/utils";
import type { BaseConversation } from "@app/lib/model_constructors/types/input/messages";
import { describe, expect, it } from "vitest";

const converters: ContentBlockConverters = {
  systemMessageToPart,
  userTextMessageToPart,
  userImageMessageToPart,
  toolCallResultMessageToContent,
  assistantTextMessageToPart,
  assistantReasoningMessageToPart,
  assistantToolCallRequestToPart,
};

describe("conversationToContents — provider_passthrough", () => {
  it("drops a passthrough message without injecting an empty part or breaking the same-role merge", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        { role: "assistant", type: "text", content: { value: "before" } },
        {
          role: "assistant",
          type: "provider_passthrough",
          content: {
            provider: "anthropic",
            block: { type: "server_tool_use", id: "x", name: "y", input: {} },
          },
        },
        { role: "assistant", type: "text", content: { value: "after" } },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    // The two text turns merge into one model Content; the passthrough produces
    // no part (no empty `{ text: "" }` slips in).
    expect(contents).toEqual([
      { role: "model", parts: [{ text: "before" }, { text: "after" }] },
    ]);
  });
});

describe("conversationToContents — function responses", () => {
  it("keeps a function response separate from following user text", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        {
          role: "assistant",
          type: "reasoning",
          content: { value: "I should enable the skill." },
        },
        {
          role: "assistant",
          type: "tool_call_request",
          content: {
            callId: "call-1",
            toolName: "skill_management__enable_skill",
            arguments: '{"skill_id":"skill-1"}',
          },
          signature: "thought-signature",
        },
        {
          role: "user",
          type: "tool_call_result",
          content: {
            callId: "call-1",
            toolName: "skill_management__enable_skill",
            parts: [{ type: "text", text: "Skill enabled." }],
            isError: false,
          },
        },
        {
          role: "user",
          type: "text",
          content: { value: "<dust_system>Skill instructions.</dust_system>" },
        },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([
      {
        role: "model",
        parts: [
          { text: "I should enable the skill.", thought: true },
          {
            functionCall: {
              id: "call-1",
              name: "skill_management__enable_skill",
              args: { skill_id: "skill-1" },
            },
            thoughtSignature: "thought-signature",
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "call-1",
              name: "skill_management__enable_skill",
              response: { output: "Skill enabled." },
            },
          },
        ],
      },
      {
        role: "user",
        parts: [{ text: "<dust_system>Skill instructions.</dust_system>" }],
      },
    ]);
  });

  it("still merges adjacent function responses into one user turn", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        {
          role: "user",
          type: "tool_call_result",
          content: {
            callId: "call-1",
            toolName: "tool-1",
            parts: [{ type: "text", text: "result-1" }],
            isError: false,
          },
        },
        {
          role: "user",
          type: "tool_call_result",
          content: {
            callId: "call-2",
            toolName: "tool-2",
            parts: [{ type: "text", text: "result-2" }],
            isError: false,
          },
        },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "call-1",
              name: "tool-1",
              response: { output: "result-1" },
            },
          },
          {
            functionResponse: {
              id: "call-2",
              name: "tool-2",
              response: { output: "result-2" },
            },
          },
        ],
      },
    ]);
  });

  it("still merges adjacent plain user messages", async () => {
    const conversation: BaseConversation = {
      system: [],
      messages: [
        {
          role: "user",
          type: "text",
          content: { value: "first" },
        },
        {
          role: "user",
          type: "text",
          content: { value: "second" },
        },
      ],
    };

    const contents = await conversationToContents(conversation, converters);

    expect(contents).toEqual([
      { role: "user", parts: [{ text: "first" }, { text: "second" }] },
    ]);
  });
});
