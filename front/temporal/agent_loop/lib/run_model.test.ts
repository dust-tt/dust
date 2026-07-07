import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { ANTHROPIC_PROVIDER_ID } from "@app/lib/api/llm/clients/anthropic/types";
import { buildSpecificationsWithReplayPlaceholders } from "@app/temporal/agent_loop/lib/run_model";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

function makeSpecification(
  name: string,
  { eager }: { eager?: boolean } = {}
): AgentActionSpecification {
  return {
    name,
    description: `Description of ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    ...(eager !== undefined ? { eager } : {}),
  };
}

function assistantMessageWithFunctionCalls(
  toolNames: string[]
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "agent",
    contents: toolNames.map((name, i) => ({
      type: "function_call",
      value: { id: `call_${i}`, name, arguments: "{}" },
    })),
  };
}

function assistantMessageWithToolSearchResult(
  toolNames: string[]
): ModelMessageTypeMultiActionsWithoutContentFragment {
  return {
    role: "assistant",
    name: "agent",
    contents: [
      {
        type: "provider_passthrough",
        value: {
          provider: ANTHROPIC_PROVIDER_ID,
          block: {
            type: "tool_search_tool_result",
            tool_use_id: "srvtoolu_test",
            content: {
              type: "tool_search_tool_search_result",
              tool_references: toolNames.map((name) => ({
                type: "tool_reference",
                tool_name: name,
              })),
            },
          },
        },
      },
    ],
  };
}

function makeConversation(
  messages: ModelMessageTypeMultiActionsWithoutContentFragment[]
): ModelConversationTypeMultiActions {
  return { messages };
}

describe("buildSpecificationsWithReplayPlaceholders", () => {
  it("does not eagerly load replayed tools that are still configured", () => {
    const baseSpecifications = [
      makeSpecification("get_weather"),
      makeSpecification("search_files"),
    ];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["get_weather"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(specifications).toEqual(baseSpecifications);
    expect(missingReplayedToolNames).toEqual([]);
  });

  it("preserves the intrinsic eager flag of replayed tools", () => {
    const baseSpecifications = [
      makeSpecification("enable_skill", { eager: true }),
    ];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["enable_skill"]),
    ]);

    const { specifications } = buildSpecificationsWithReplayPlaceholders(
      baseSpecifications,
      conversation
    );

    expect(specifications[0].eager).toBe(true);
  });

  it("appends a non-eager placeholder for replayed tools no longer configured", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications).toHaveLength(2);
    const placeholder = specifications[1];
    expect(placeholder.name).toBe("removed_tool");
    expect(placeholder.eager).toBeUndefined();
  });

  it("appends placeholders for tools referenced by replayed tool search results", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithToolSearchResult(["get_weather", "removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications.map((s) => s.name)).toEqual([
      "get_weather",
      "removed_tool",
    ]);
  });

  it("never synthesizes a placeholder for the tool search tool itself", () => {
    const baseSpecifications = [makeSpecification("get_weather")];
    const conversation = makeConversation([
      assistantMessageWithToolSearchResult([
        "tool_search_tool_bm25",
        "tool_search_tool_regex",
      ]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders(
        baseSpecifications,
        conversation
      );

    expect(missingReplayedToolNames).toEqual([]);
    expect(specifications).toEqual(baseSpecifications);
  });

  it("dedupes missing tools replayed multiple times", () => {
    const conversation = makeConversation([
      assistantMessageWithFunctionCalls(["removed_tool", "removed_tool"]),
      assistantMessageWithToolSearchResult(["removed_tool"]),
    ]);

    const { specifications, missingReplayedToolNames } =
      buildSpecificationsWithReplayPlaceholders([], conversation);

    expect(missingReplayedToolNames).toEqual(["removed_tool"]);
    expect(specifications).toHaveLength(1);
  });
});
