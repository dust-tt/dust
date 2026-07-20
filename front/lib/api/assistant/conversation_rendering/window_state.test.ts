import type { InteractionWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";
import { ConversationWindowState } from "@app/lib/api/assistant/conversation_rendering/window_state";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

function withTokens<T extends ModelMessageTypeMultiActions>(
  message: T,
  tokenCount: number
): T & { tokenCount: number } {
  return { ...message, tokenCount };
}

function interaction(
  name: string,
  toolResultTokenCounts: number[],
  userTokenCount = 10
): InteractionWithTokens {
  return {
    messages: [
      withTokens(
        {
          role: "user" as const,
          name: "user",
          content: [{ type: "text" as const, text: name }],
        },
        userTokenCount
      ),
      ...toolResultTokenCounts.map((tokenCount, index) =>
        withTokens(
          {
            role: "function" as const,
            name: `${name}_tool_${index}`,
            function_call_id: `${name}_tool_${index}_call`,
            content: `${name}_result_${index}`,
          },
          tokenCount
        )
      ),
    ],
  };
}

function interactionNames(interactions: InteractionWithTokens[]): string[] {
  return interactions.map((item) => {
    const firstMessage = item.messages[0];
    const firstContent =
      firstMessage.role === "user" ? firstMessage.content[0] : undefined;
    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected each test interaction to start with text");
    }

    return firstContent.text;
  });
}

function toolResults(interactions: InteractionWithTokens[]) {
  return interactions
    .flatMap((item) => item.messages)
    .filter((message) => message.role === "function");
}

function isPruned(content: unknown): boolean {
  return typeof content === "string" && content.includes("no longer available");
}

describe("ConversationWindowState", () => {
  it("prunes a long current interaction in one checkpoint while preserving its latest result", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 30_000,
      budgetForInteractions: 100_000,
      logDetails: {},
    });

    state.append(interaction("current", [10_000, 10_000, 10_000, 10_000]));

    const results = toolResults(state.renderedInteractions());
    expect(
      results.slice(0, 3).every((message) => isPruned(message.content))
    ).toBe(true);
    expect(results[3].content).toBe("current_result_3");
  });

  it("does not move the pruning frontier again before the reclaimed headroom is consumed", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 30_000,
      budgetForInteractions: 100_000,
      logDetails: {},
    });

    state.append(interaction("first", [10_000, 10_000, 10_000, 10_000]));
    state.append(interaction("second", [10_000]));

    const results = toolResults(state.renderedInteractions());
    expect(
      results.slice(0, 3).every((message) => isPruned(message.content))
    ).toBe(true);
    expect(results[3].content).toBe("first_result_3");
    expect(results[4].content).toBe("second_result_0");
  });

  it("drops old interactions at the soft limit in a checkpoint-sized batch", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 50_000,
      budgetForInteractions: 100_000,
      logDetails: {},
    });

    for (let i = 1; i <= 6; i++) {
      state.append(interaction(`turn_${i}`, [], 10_000));
    }

    expect(interactionNames(state.renderedInteractions())).toEqual([
      "turn_4",
      "turn_5",
      "turn_6",
    ]);
    expect(state.fit().isOk()).toBe(true);
  });

  it("ignores the checkpoint minimum at the hard limit", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 50_000,
      budgetForInteractions: 55_000,
      logDetails: {},
    });

    state.append(interaction("current", [10_000, 45_000]));

    expect(state.fit().isOk()).toBe(true);
    const results = toolResults(state.renderedInteractions());
    expect(isPruned(results[0].content)).toBe(true);
    expect(results[1].content).toBe("current_result_1");
  });

  it("drops protected previous interactions at the hard limit", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 50_000,
      budgetForInteractions: 55_000,
      logDetails: {},
    });

    state.append(interaction("turn_1", [], 20_000));
    state.append(interaction("turn_2", [], 20_000));
    state.append(interaction("turn_3", [], 20_000));

    expect(interactionNames(state.renderedInteractions())).toEqual(["turn_3"]);
    expect(state.fit().isOk()).toBe(true);
  });

  it("returns overflow rather than pruning the latest current result", () => {
    const state = ConversationWindowState.empty({
      pruningBudget: 50_000,
      budgetForInteractions: 55_000,
      logDetails: {},
    });

    state.append(interaction("current", [60_000]));

    expect(state.fit().isErr()).toBe(true);
    const results = toolResults(state.renderedInteractions());
    expect(results[0].content).toBe("current_result_0");
  });
});
