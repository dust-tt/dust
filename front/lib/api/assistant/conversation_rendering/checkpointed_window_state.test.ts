import {
  CheckpointedConversationWindowState,
  ConversationWindowStateSnapshotSchema,
  MINIMUM_PRUNING_BATCH_TOKENS,
} from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import type { InteractionWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

function withTokens<T extends ModelMessageTypeMultiActions>(
  message: T,
  tokenCount: number
): T & { tokenCount: number } {
  return { ...message, tokenCount };
}

function userMessage(name: string, tokenCount: number) {
  return withTokens(
    {
      role: "user" as const,
      name: "user",
      content: [{ type: "text" as const, text: name }],
    },
    tokenCount
  );
}

function assistantMessage(name: string, tokenCount = 10) {
  return withTokens(
    {
      role: "assistant" as const,
      name: "assistant",
      content: name,
      contents: [{ type: "text_content" as const, value: name }],
    },
    tokenCount
  );
}

function reasoningMessage(reasoningTokens: number, tokenCount = 10) {
  return withTokens(
    {
      role: "assistant" as const,
      name: "assistant",
      contents: [
        {
          type: "reasoning" as const,
          value: {
            reasoning: "reasoning",
            metadata: "{}",
            tokens: reasoningTokens,
            provider: "openai" as const,
          },
        },
      ],
    },
    tokenCount
  );
}

function functionMessage(name: string, tokenCount: number) {
  return withTokens(
    {
      role: "function" as const,
      name,
      function_call_id: `${name}_call`,
      content: `${name}_result`,
    },
    tokenCount
  );
}

function interaction(
  messages: InteractionWithTokens["messages"]
): InteractionWithTokens {
  return { messages };
}

function toolResults(state: CheckpointedConversationWindowState) {
  return state
    .renderedInteractions()
    .flatMap((item) => item.messages)
    .filter((message) => message.role === "function");
}

function isPruned(content: unknown): boolean {
  return typeof content === "string" && content.includes("no longer available");
}

function makeState({
  pruningBudget = 30_000,
  budgetForInteractions = 100_000,
}: {
  pruningBudget?: number;
  budgetForInteractions?: number;
} = {}) {
  return CheckpointedConversationWindowState.empty({
    pruningBudget,
    budgetForInteractions,
    logDetails: {},
  });
}

describe("CheckpointedConversationWindowState", () => {
  it("preserves interaction boundaries and message data when no pruning is needed", () => {
    const state = makeState();
    const interactions = [
      interaction([userMessage("first", 10), assistantMessage("first_answer")]),
      interaction([
        userMessage("second", 10),
        assistantMessage("second_call"),
        functionMessage("second_result", 100),
      ]),
    ];

    for (const item of interactions) {
      state.append(item);
    }

    expect(state.renderedInteractions()).toEqual(interactions);
  });

  it("keeps complete interactions when non-tool history crosses the pruning budget", () => {
    const state = makeState();

    state.append(interaction([userMessage("first", 20_000)]));
    state.append(interaction([userMessage("second", 20_000)]));
    state.append(interaction([userMessage("third", 20_000)]));

    expect(state.fit().isOk()).toBe(true);
    expect(state.renderedInteractions()).toHaveLength(3);
    expect(
      state
        .renderedInteractions()
        .flatMap((item) => item.messages)
        .filter((message) => message.role === "user")
        .map((message) => message.content[0])
    ).toEqual([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
      { type: "text", text: "third" },
    ]);
  });

  it("keeps serving intact interactions past the nominal budget", () => {
    const state = makeState({ budgetForInteractions: 50_000 });

    state.append(interaction([userMessage("first", 30_000)]));
    state.append(interaction([userMessage("second", 30_000)]));

    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.stats.totalTokensAfterPruning).toBe(60_000);
    expect(result.value.stats.budgetForInteractions).toBe(50_000);
    expect(state.renderedInteractions()).toHaveLength(2);
  });

  it("prunes consumed results in a buffered checkpoint and protects the pending batch", () => {
    const state = makeState();
    const input = interaction([
      userMessage("question", 10),
      assistantMessage("call_first"),
      functionMessage("first", 11_000),
      assistantMessage("call_second"),
      functionMessage("second", 11_000),
      assistantMessage("call_parallel"),
      functionMessage("pending_first", 11_000),
      functionMessage("pending_second", 11_000),
    ]);

    state.append(input);

    const results = toolResults(state);
    expect(isPruned(results[0].content)).toBe(true);
    expect(isPruned(results[1].content)).toBe(true);
    expect(results[2].content).toBe("pending_first_result");
    expect(results[3].content).toBe("pending_second_result");
    expect(
      input.messages
        .filter((message) => message.role === "function")
        .map((message) => message.content)
    ).toEqual([
      "first_result",
      "second_result",
      "pending_first_result",
      "pending_second_result",
    ]);

    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.prunedContext).toBe(true);
  });

  it("does not surface pruning from an earlier interaction", () => {
    const state = makeState();

    state.append(
      interaction([
        userMessage("first_question", 10),
        assistantMessage("call_first"),
        functionMessage("first", 11_000),
        assistantMessage("call_second"),
        functionMessage("second", 11_000),
        assistantMessage("call_third"),
        functionMessage("third", 11_000),
      ])
    );
    state.append(interaction([userMessage("follow_up", 10)]));

    expect(
      toolResults(state).some((message) => isPruned(message.content))
    ).toBe(true);
    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.prunedContext).toBe(false);
  });

  it("waits for a full checkpoint of reclaimable results before moving the frontier", () => {
    const state = makeState({ pruningBudget: 15_000 });

    state.append(
      interaction([
        userMessage("question", 10),
        assistantMessage("call_first"),
        functionMessage("first", 10_100),
        assistantMessage("call_second"),
        functionMessage("second", 10_100),
      ])
    );

    expect(
      toolResults(state).every((message) => !isPruned(message.content))
    ).toBe(true);

    state.append(
      interaction([
        assistantMessage("call_third"),
        functionMessage("third", 1_000),
      ])
    );

    const results = toolResults(state);
    expect(isPruned(results[0].content)).toBe(true);
    expect(isPruned(results[1].content)).toBe(true);
    expect(results[2].content).toBe("third_result");
  });

  it("accepts a smaller batch when it restores fit at the nominal budget", () => {
    const state = makeState({
      pruningBudget: 10_000,
      budgetForInteractions: 20_000,
    });

    state.append(
      interaction([
        userMessage("question", 15_000),
        assistantMessage("call_tool"),
        // Pruning retains a 24-token placeholder, so this yields exactly the minimum savings.
        functionMessage("result", MINIMUM_PRUNING_BATCH_TOKENS + 24),
        assistantMessage("answer"),
      ])
    );
    state.append(interaction([userMessage("follow_up", 10)]));

    expect(isPruned(toolResults(state)[0].content)).toBe(true);
  });

  it("keeps a smaller batch intact below the minimum", () => {
    const state = makeState({
      pruningBudget: 10_000,
      budgetForInteractions: 20_000,
    });

    state.append(
      interaction([
        userMessage("question", 15_000),
        assistantMessage("call_tool"),
        functionMessage("result", MINIMUM_PRUNING_BATCH_TOKENS + 24 - 1),
        assistantMessage("answer"),
      ])
    );
    state.append(interaction([userMessage("follow_up", 10)]));

    expect(isPruned(toolResults(state)[0].content)).toBe(false);
  });

  it("keeps a smaller batch intact when pruning it cannot restore fit", () => {
    const state = makeState({
      pruningBudget: 10_000,
      budgetForInteractions: 20_000,
    });

    state.append(
      interaction([
        userMessage("question", 21_000),
        assistantMessage("call_tool"),
        functionMessage("result", MINIMUM_PRUNING_BATCH_TOKENS + 1_000 + 24),
        assistantMessage("answer"),
      ])
    );
    state.append(interaction([userMessage("follow_up", 10)]));

    expect(isPruned(toolResults(state)[0].content)).toBe(false);
  });

  it("replays the same pruning frontier when the conversation grows", () => {
    const prefix = interaction([
      userMessage("question", 10),
      assistantMessage("call_first"),
      functionMessage("first", 11_000),
      assistantMessage("call_second"),
      functionMessage("second", 11_000),
      assistantMessage("call_third"),
      functionMessage("third", 11_000),
    ]);
    const prefixState = makeState();
    prefixState.append(prefix);

    const extendedState = makeState();
    extendedState.append(prefix);
    extendedState.append(
      interaction([
        assistantMessage("call_fourth"),
        functionMessage("fourth", 1_000),
      ])
    );

    const prefixResults = toolResults(prefixState);
    const extendedResults = toolResults(extendedState);
    expect(prefixResults.map((message) => isPruned(message.content))).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      extendedResults.slice(0, 3).map((message) => isPruned(message.content))
    ).toEqual([true, true, false]);
  });

  it("restores and continues an interaction like uninterrupted rendering", () => {
    const prefix = [
      userMessage("question", 10),
      assistantMessage("call_first"),
      functionMessage("first", 10_100),
    ];
    const continuation = [
      assistantMessage("call_second"),
      functionMessage("second", 10_100),
      assistantMessage("call_third"),
      functionMessage("third", 1_000),
    ];

    const uninterrupted = makeState({ pruningBudget: 15_000 });
    uninterrupted.append(interaction([...prefix, ...continuation]));

    const checkpointed = makeState({ pruningBudget: 15_000 });
    checkpointed.append(interaction(prefix));
    const serializedSnapshot: unknown = JSON.parse(
      JSON.stringify(checkpointed.snapshot())
    );
    const parsedSnapshot =
      ConversationWindowStateSnapshotSchema.safeParse(serializedSnapshot);
    expect(parsedSnapshot.success).toBe(true);
    if (!parsedSnapshot.success) {
      return;
    }

    const restored = CheckpointedConversationWindowState.restore(
      parsedSnapshot.data,
      {
        pruningBudget: 15_000,
        budgetForInteractions: 100_000,
        logDetails: {},
      }
    );
    restored.appendToLatestInteraction(interaction(continuation));

    expect(restored.snapshot()).toEqual(uninterrupted.snapshot());
    expect(restored.fit()).toEqual(uninterrupted.fit());
    expect(checkpointed.renderedInteractions()).toHaveLength(1);
    expect(isPruned(toolResults(checkpointed)[0].content)).toBe(false);
  });

  it("rejects an inconsistent persisted tool-result phase", () => {
    const snapshot = {
      version: 1,
      interactions: [
        {
          messages: [
            {
              kind: "tool_result",
              message: {
                role: "function",
                name: "tool",
                function_call_id: "call_1",
                content: "result",
                tokenCount: 100,
              },
              tokenSavings: 50,
              pruned: true,
              phase: "eligible",
            },
          ],
        },
      ],
      retainedTokens: 100,
      totalTokensBefore: 150,
      prunedTokens: 50,
    };

    expect(
      ConversationWindowStateSnapshotSchema.safeParse(snapshot).success
    ).toBe(false);
  });

  it("rejects fractional reasoning token counts", () => {
    const state = makeState();
    state.append(interaction([reasoningMessage(1.5)]));

    expect(
      ConversationWindowStateSnapshotSchema.safeParse(state.snapshot()).success
    ).toBe(false);
  });

  it("rejects fractional message token counts even when their total is an integer", () => {
    const state = makeState();
    state.append(
      interaction([userMessage("first", 0.5), userMessage("second", 0.5)])
    );

    expect(
      ConversationWindowStateSnapshotSchema.safeParse(state.snapshot()).success
    ).toBe(false);
  });
});
