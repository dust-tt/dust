import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import type { ReasoningEffort } from "@app/types/assistant/models/types";

const SYSTEM_PROMPT = "You are a helpful assistant.";

function userText(
  text: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return { role: "user", name: "User", content: [{ type: "text", text }] };
}

function userTextWithImage(
  text: string,
  url: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "user",
    name: "User",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url } },
    ],
  };
}

function assistantText(
  value: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "Assistant",
    contents: [{ type: "text_content", value }],
  };
}

function assistantToolCall(
  id: string,
  name: string,
  args: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "Assistant",
    contents: [{ type: "function_call", value: { id, name, arguments: args } }],
  };
}

function toolResult(
  name: string,
  callId: string,
  content: string
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return { role: "function", name, function_call_id: callId, content };
}

const GET_USER_ID_SPEC: AgentActionSpecification = {
  name: "GetUserId",
  description: "Get the user ID given the user's name.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "The user's name." } },
    required: ["name"],
  },
};

const GET_DATE_SPEC: AgentActionSpecification = {
  name: "GetCurrentDate",
  description: "Get the current date.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

/**
 * One parity case: the same inputs fed to both the legacy and the new router.
 * `streamParameters` drives the conversation surface; the remaining fields map to
 * the per-call `LLMParameters` (temperature, reasoning effort, structured output).
 */
export interface ParityCase {
  label: string;
  streamParameters: LLMStreamParameters;
  temperature?: number | null;
  reasoningEffort?: ReasoningEffort | null;
  responseFormat?: string | null;
}

const USER_PROFILE_FORMAT = JSON.stringify({
  type: "json_schema",
  json_schema: {
    name: "user_profile",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        age: { type: "number" },
        active: { type: "boolean" },
      },
      required: ["name", "email", "age", "active"],
      additionalProperties: false,
    },
  },
});

// Configuration variants exercised on a simple conversation so config -> payload
// mapping (temperature, reasoning effort) is compared independently of message shape.
const CONFIG_VARIANTS: Pick<ParityCase, "temperature" | "reasoningEffort">[] = [
  {},
  { temperature: 0.7 },
  { temperature: 0 },
  { reasoningEffort: "none" },
  { reasoningEffort: "light" },
  { reasoningEffort: "medium" },
  { reasoningEffort: "high" },
  { temperature: 0.7, reasoningEffort: "medium" },
];

export function buildParityMatrix(): ParityCase[] {
  const cases: ParityCase[] = [];

  // Simple text x config variants.
  for (const variant of CONFIG_VARIANTS) {
    const parts = [
      variant.temperature !== undefined ? `t-${variant.temperature}` : "t-def",
      variant.reasoningEffort !== undefined
        ? `r-${variant.reasoningEffort}`
        : "r-def",
    ];
    cases.push({
      label: `simple/${parts.join("/")}`,
      streamParameters: {
        conversation: { messages: [userText("What is 2+2? Be concise.")] },
        prompt: SYSTEM_PROMPT,
        specifications: [],
      },
      ...variant,
    });
  }

  // Multi-turn (assistant text in history).
  cases.push({
    label: "multi-turn",
    streamParameters: {
      conversation: {
        messages: [
          userText("Hello, my name is Stan. How are you?"),
          assistantText("Hi Stan! I'm doing well."),
          userText("What is my name?"),
        ],
      },
      prompt: SYSTEM_PROMPT,
      specifications: [],
    },
  });

  // Tool specification present (no call yet).
  cases.push({
    label: "tools/spec-only",
    streamParameters: {
      conversation: { messages: [userText("What is the id of Stan?")] },
      prompt: SYSTEM_PROMPT,
      specifications: [GET_USER_ID_SPEC],
    },
  });

  // Assistant tool-call request followed by a tool result.
  cases.push({
    label: "tools/call-and-result",
    streamParameters: {
      conversation: {
        messages: [
          userText("What is the id of Stan?"),
          assistantToolCall("call_1", "GetUserId", '{"name":"Stan"}'),
          toolResult("GetUserId", "call_1", "88888"),
        ],
      },
      prompt: SYSTEM_PROMPT,
      specifications: [GET_USER_ID_SPEC],
    },
  });

  // Forced tool call.
  cases.push({
    label: "tools/force",
    streamParameters: {
      conversation: { messages: [userText("What is the current date?")] },
      prompt: SYSTEM_PROMPT,
      specifications: [GET_DATE_SPEC],
      forceToolCall: "GetCurrentDate",
    },
  });

  // Vision (image part). Uses an inline `data:` URI (a 1x1 PNG) so the suite
  // stays hermetic — the legacy path resolves it in-process instead of doing a
  // live network fetch.
  cases.push({
    label: "vision",
    streamParameters: {
      conversation: {
        messages: [
          userTextWithImage(
            "Describe this image.",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAYAAAEq8Z4AAAAASUVORK5CYII="
          ),
        ],
      },
      prompt: SYSTEM_PROMPT,
      specifications: [],
    },
  });

  // Structured output.
  cases.push({
    label: "structured-output",
    streamParameters: {
      conversation: {
        messages: [
          userText(
            "Extract: Name is John Doe, email john@example.com, age 30, active."
          ),
        ],
      },
      prompt: SYSTEM_PROMPT,
      specifications: [],
    },
    responseFormat: USER_PROFILE_FORMAT,
  });

  return cases;
}
