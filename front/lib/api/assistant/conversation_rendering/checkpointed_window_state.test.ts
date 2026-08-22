import {
  CheckpointedConversationWindowState,
  MINIMUM_PRUNING_BATCH_TOKENS,
} from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import {
  IMAGE_CONTENT_TOKEN_COUNT,
  type InteractionWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { isImageContent } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

const DEFAULT_MESSAGE_TOKEN_COUNT = 10;
const PRUNABLE_TOOL_RESULT_TOKEN_COUNT = 11_000;
const LOW_PRUNING_BUDGET = 15_000;

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

function userImageMessage(name: string, imageUrls: string[]) {
  return withTokens(
    {
      role: "user" as const,
      name,
      content: imageUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    },
    imageUrls.length * IMAGE_CONTENT_TOKEN_COUNT + DEFAULT_MESSAGE_TOKEN_COUNT
  );
}

function assistantMessage(
  name: string,
  tokenCount = DEFAULT_MESSAGE_TOKEN_COUNT
) {
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

function functionImageMessage(name: string, tokenCount: number) {
  return withTokens(
    {
      role: "function" as const,
      name,
      function_call_id: `${name}_call`,
      content: [
        {
          type: "image_url" as const,
          image_url: { url: `${name}_image` },
        },
      ],
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
  maxImages,
}: {
  pruningBudget?: number;
  budgetForInteractions?: number;
  maxImages?: number;
} = {}) {
  return CheckpointedConversationWindowState.empty({
    pruningBudget,
    budgetForInteractions,
    logDetails: {},
    maxImages,
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

  it("rejects messages appended after the state has been fitted", () => {
    const state = makeState();
    state.append(
      interaction([userMessage("first", DEFAULT_MESSAGE_TOKEN_COUNT)])
    );
    state.fit();

    expect(() =>
      state.append(
        interaction([userMessage("second", DEFAULT_MESSAGE_TOKEN_COUNT)])
      )
    ).toThrow("Cannot append to a fitted conversation window state.");
  });

  it("prunes the oldest images and retains the newest images", () => {
    const state = makeState({ maxImages: 1 });
    const input = userImageMessage("user", ["old_image", "new_image"]);

    state.append(interaction([input]));

    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const [message] = result.value.interactions[0].messages;
    expect(message.role).toBe("user");
    if (message.role !== "user") {
      return;
    }
    expect(message.content).toEqual([
      { type: "image_url", image_url: { url: "new_image" } },
    ]);
    expect(result.value.stats.totalTokensAfterPruning).toBe(
      input.tokenCount - IMAGE_CONTENT_TOKEN_COUNT
    );
    expect(result.value.stats.prunedImageCount).toBe(1);
    expect(result.value.prunedContext).toBe(false);
    expect(input.content.filter(isImageContent)).toHaveLength(2);
  });

  it("keeps image-only messages valid when every image is pruned", () => {
    const state = makeState({ maxImages: 1 });
    const oldMessage = userImageMessage("old", ["old_image"]);

    state.append(interaction([oldMessage]));
    state.append(interaction([userImageMessage("new", ["new_image"])]));

    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    const messages = result.value.interactions.flatMap((item) => item.messages);
    expect(messages[0].role).toBe("user");
    if (messages[0].role !== "user") {
      return;
    }
    expect(messages[0].content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("model input image limit"),
      },
    ]);
    expect(result.value.prunedContext).toBe(false);
    expect(oldMessage.content).toEqual([
      { type: "image_url", image_url: { url: "old_image" } },
    ]);
  });

  it("counts only images surviving tool-result pruning", () => {
    const state = makeState({
      pruningBudget: LOW_PRUNING_BUDGET,
      maxImages: 1,
    });

    state.append(
      interaction([
        userImageMessage("user", ["user_image"]),
        assistantMessage("call_first"),
        functionImageMessage("first", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
        assistantMessage("call_second"),
        functionImageMessage("second", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
        assistantMessage("answer"),
      ])
    );
    state.append(interaction([userMessage("follow_up", 10)]));

    const result = state.fit();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(
      toolResults(state).every((message) => isPruned(message.content))
    ).toBe(true);
    const firstMessage = result.value.interactions[0].messages[0];
    expect(firstMessage.role).toBe("user");
    if (firstMessage.role !== "user") {
      return;
    }
    expect(firstMessage.content).toEqual([
      { type: "image_url", image_url: { url: "user_image" } },
    ]);
  });

  it("prunes consumed results in a buffered checkpoint and protects the pending batch", () => {
    const state = makeState();
    const input = interaction([
      userMessage("question", 10),
      assistantMessage("call_first"),
      functionMessage("first", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
      assistantMessage("call_second"),
      functionMessage("second", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
      assistantMessage("call_parallel"),
      functionMessage("pending_first", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
      functionMessage("pending_second", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
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
        functionMessage("first", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
        assistantMessage("call_second"),
        functionMessage("second", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
        assistantMessage("call_third"),
        functionMessage("third", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
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
    const state = makeState({ pruningBudget: LOW_PRUNING_BUDGET });

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
      functionMessage("first", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
      assistantMessage("call_second"),
      functionMessage("second", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
      assistantMessage("call_third"),
      functionMessage("third", PRUNABLE_TOOL_RESULT_TOKEN_COUNT),
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
});
