// @vitest-environment node
//
// Repro for https://github.com/dust-tt/tasks/issues/10229.
//
// Fails until the OpenAI input converter loads a replayed tool eagerly when the
// call replaying it carries no namespace. Hits the live API, so it is gated the
// same way the endpoint tests are.
//
// NODE_ENV=test RUN_LLM_TEST=true npm run test -- --config lib/model_constructors/test/vite.config.js lib/model_constructors/test/cross_provider_namespace_replay.test.ts

import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { runStream } from "@app/lib/model_constructors/test/stream";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { BaseConversation } from "@app/lib/model_constructors/types/input/messages";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { describe, expect, it } from "vitest";

const TOOL_NAME = "weather_service__get_current";

const TOOL = {
  name: TOOL_NAME,
  description: "Get the current weather for a city",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
    additionalProperties: false,
  },
};

// A tool_search_output item captured from a real gpt-5.6-luna turn: the search
// loaded the deferred tool, which puts it in a namespace named after the tool.
const TOOL_SEARCH_CALL = {
  id: "tsc_0b6d24838d2da249016a914922fce487d294e8e792781a0d9b",
  type: "tool_search_call",
  status: "completed",
  arguments: { paths: [TOOL_NAME] },
  call_id: null,
  execution: "server",
};

const TOOL_SEARCH_OUTPUT = {
  id: "tso_0b6d24838d2da249016a9149230f6487d2bfe4863a46429590",
  type: "tool_search_output",
  status: "completed",
  call_id: null,
  execution: "server",
  tools: [
    {
      type: "function",
      defer_loading: true,
      description: TOOL.description,
      name: TOOL_NAME,
      output_schema: null,
      parameters: TOOL.inputSchema,
      strict: false,
    },
  ],
};

// The tool call itself was produced by Anthropic after the provider switch, so
// it carries no namespace.
function conversation({
  withNamespace,
}: {
  withNamespace: boolean;
}): BaseConversation {
  return {
    system: [],
    messages: [
      {
        role: "user",
        type: "text",
        content: { value: "What is the weather in Paris?" },
      },
      {
        role: "assistant",
        type: "provider_passthrough",
        content: { provider: "openai", block: TOOL_SEARCH_CALL },
      },
      {
        role: "assistant",
        type: "provider_passthrough",
        content: { provider: "openai", block: TOOL_SEARCH_OUTPUT },
      },
      {
        role: "assistant",
        type: "tool_call_request",
        content: {
          callId: "call_repro_10229",
          toolName: TOOL_NAME,
          arguments: JSON.stringify({ city: "Paris" }),
          ...(withNamespace ? { namespace: TOOL_NAME } : {}),
        },
      },
      {
        role: "user",
        type: "tool_call_result",
        content: {
          callId: "call_repro_10229",
          toolName: TOOL_NAME,
          parts: [{ type: "text", text: "Sunny, 21C" }],
          isError: false,
        },
      },
    ],
  };
}

async function collect(
  conv: BaseConversation,
  config: InputConfig
): Promise<ModelResponseEvent[]> {
  const instance = new OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream({
    OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
  });
  const events: ModelResponseEvent[] = [];
  for await (const event of runStream(
    instance,
    OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream.configSchema,
    { conversation: conv },
    config
  )) {
    events.push(event);
  }
  return events;
}

function report(
  label: string,
  events: ModelResponseEvent[]
): ModelResponseEvent | undefined {
  const last = events[events.length - 1];
  console.log(`\n### ${label} -> ${last?.type}`);
  if (last?.type === "error") {
    console.log(JSON.stringify(last.content).slice(0, 700));
  }
  return last;
}

const RUN_LIVE =
  process.env.NODE_ENV === "test" && process.env.RUN_LLM_TEST === "true";

describe.skipIf(!RUN_LIVE)("issue 10229", () => {
  // The failing shape: an earlier OpenAI turn tool-searched the tool (so the
  // replayed tool_search_output puts it in a namespace named after it), then a
  // provider switch produced a call with no namespace. OpenAI rejects the
  // request with "Missing namespace for function_call".
  it("accepts a namespaceless call to a tool loaded by a replayed tool search", async () => {
    const last = report(
      "namespaceless replay",
      await collect(conversation({ withNamespace: false }), {
        tools: [TOOL],
        toolSearchEnabled: true,
      })
    );
    expect(last?.type).toBe("success");
  }, 60_000);

  it("accepts the same call when it carries its namespace", async () => {
    const last = report(
      "control (namespace present)",
      await collect(conversation({ withNamespace: true }), {
        tools: [TOOL],
        toolSearchEnabled: true,
      })
    );
    expect(last?.type).toBe("success");
  }, 60_000);

  it("accepts a namespaceless call when the tool is loaded eagerly", async () => {
    const last = report(
      "fix (eager tool)",
      await collect(conversation({ withNamespace: false }), {
        tools: [{ ...TOOL, eager: true }],
        toolSearchEnabled: true,
      })
    );
    expect(last?.type).toBe("success");
  }, 60_000);
});
