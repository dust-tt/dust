import type { PokeAgentMessageType } from "@app/types/poke";
import { describe, expect, it } from "vitest";

import { getToolExecutionTimelineEntries } from "./conversation_tool_execution_timeline";

describe("getToolExecutionTimelineEntries", () => {
  it("places provider passthrough entries at their agent-loop step", () => {
    const contents: PokeAgentMessageType["contents"] = [
      {
        step: 4,
        content: {
          type: "provider_passthrough",
          value: {
            provider: "anthropic",
            block: { type: "server_tool_use" },
          },
        },
      },
      {
        step: 4,
        content: {
          type: "provider_passthrough",
          value: {
            provider: "anthropic",
            block: { type: "tool_search_tool_result" },
          },
        },
      },
    ];
    const actions = [
      { sId: "action-1", step: 1 },
      { sId: "action-4", step: 4 },
      { sId: "action-6", step: 6 },
    ];

    const entries = getToolExecutionTimelineEntries(contents, actions);

    expect(entries.map(({ type, step }) => `${type}:${step}`)).toEqual([
      "action:1",
      "provider_passthrough:4",
      "provider_passthrough:4",
      "action:4",
      "action:6",
    ]);
  });
});
