import { CheckpointedConversationWindowState } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import { makeConversationWindowCheckpoint } from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import { renderConversationWindow } from "@app/lib/api/assistant/conversation_rendering/conversation_window_core";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActions,
  UserMessageTypeModel,
} from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";
import { GPT_4O_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderConversationForModel,
  TOKENS_MARGIN,
  TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR,
} from "./index";
import { renderAllMessages } from "./message_rendering";

vi.mock(
  "@app/lib/api/assistant/conversation_rendering/message_rendering",
  () => ({
    renderAllMessages: vi.fn(),
  })
);

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    distribution: vi.fn(),
    increment: vi.fn(),
  },
}));

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

function createConversation(owner: LightWorkspaceType): ConversationType {
  return {
    id: 1,
    sId: "conv_1",
    created: 0,
    updated: 0,
    unread: false,
    lastReadMs: null,
    actionRequired: false,
    hasError: false,
    title: null,
    spaceId: null,
    triggerId: null,
    depth: 0,
    metadata: {},
    requestedSpaceIds: [],
    isRunningAgentLoop: true,
    owner,
    visibility: "unlisted",
    content: [],
  };
}

function userMessage(
  text: string,
  name = "user"
): ModelMessageTypeMultiActions {
  return {
    role: "user" as const,
    name,
    content: [{ type: "text" as const, text }],
  };
}

function contentFragmentMessage(text: string): ModelMessageTypeMultiActions {
  return {
    role: "content_fragment" as const,
    name: "content_fragment",
    content: [{ type: "text" as const, text }],
  };
}

function assistantMessage(text: string): ModelMessageTypeMultiActions {
  return {
    role: "assistant" as const,
    name: "assistant",
    content: text,
    contents: [{ type: "text_content" as const, value: text }],
  };
}

function functionMessage(
  name: string,
  content: string
): ModelMessageTypeMultiActions {
  return {
    role: "function" as const,
    name,
    function_call_id: `${name}_call`,
    content,
  };
}

function isUserMessage(
  message: ModelMessageTypeMultiActions
): message is UserMessageTypeModel {
  return message.role === "user";
}

function isFunctionMessage(
  message: ModelMessageTypeMultiActions
): message is FunctionMessageTypeModel {
  return message.role === "function";
}

function textOf(content: Content): string | undefined {
  return isTextContent(content) ? content.text : undefined;
}

function getFunctionMessage(
  messages: ModelMessageTypeMultiActions[],
  name?: string
): FunctionMessageTypeModel {
  const message = messages.find(
    (m): m is FunctionMessageTypeModel =>
      isFunctionMessage(m) && (name === undefined || m.name === name)
  );
  if (!message) {
    throw new Error(
      `Expected a function message${name ? ` named ${name}` : ""}`
    );
  }
  return message;
}

function mockTokenCounter({
  byContains,
  promptTokens = 10,
  toolsTokens = 10,
}: {
  byContains: Record<string, number>;
  promptTokens?: number;
  toolsTokens?: number;
}) {
  vi.mocked(tokenCountForTexts).mockImplementation(async (texts) => {
    if (texts.length === 2 && texts[0] === "PROMPT" && texts[1] === "TOOLS") {
      return new Ok([promptTokens, toolsTokens]);
    }

    const counts = texts.map((t) => {
      for (const [needle, tokenCount] of Object.entries(byContains)) {
        if (t.includes(needle)) {
          return tokenCount;
        }
      }
      return 5;
    });

    return new Ok(counts);
  });
}

function computeAllowedTokenCount({
  promptTokens,
  toolsTokens,
  interactionTokens,
  availableDelta = 0,
}: {
  promptTokens: number;
  toolsTokens: number;
  interactionTokens: number;
  availableDelta?: number;
}) {
  const baseTokens =
    promptTokens +
    Math.floor(toolsTokens * TOOL_DEFINITIONS_COUNT_ADJUSTMENT_FACTOR) +
    TOKENS_MARGIN;
  return baseTokens + interactionTokens + availableDelta;
}

function checkpointSnapshot(messages: ModelMessageTypeMultiActions[]) {
  const state = CheckpointedConversationWindowState.empty({
    pruningBudget: 100_000,
    budgetForInteractions: 100_000,
    logDetails: {},
  });
  state.append({
    messages: messages.map((message) => ({ ...message, tokenCount: 10 })),
  });

  return state.snapshot();
}

function checkpoint(messages: ModelMessageTypeMultiActions[]) {
  return makeConversationWindowCheckpoint({
    identity: {
      workspaceId: "w_1",
      conversationId: "conv_1",
      agentMessageId: "agent_message_1",
      agentMessageVersion: 0,
      step: 0,
    },
    profileHash: "profile",
    promptTokens: 10,
    toolDefinitionTokens: 20,
    state: checkpointSnapshot(messages),
  });
}

describe("seeded conversation window", () => {
  const model = GPT_4O_MODEL_CONFIG;
  let auth: Authenticator;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    ({ authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    }));
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({});
  });

  it("restores an exact checkpoint without rendering or tokenizing", async () => {
    const conversation = createConversation(workspace);
    const result = await renderConversationWindow(
      auth,
      {
        model,
        prompt: "PROMPT",
        enabledSkills: [],
        tools: "TOOLS",
        allowedTokenCount: 100_000,
      },
      {
        kind: "checkpoint_exact",
        conversation,
        checkpoint: checkpoint([
          userMessage("saved user"),
          assistantMessage("saved assistant"),
        ]),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.modelConversation.messages).toEqual([
      userMessage("saved user"),
      assistantMessage("saved assistant"),
    ]);
    expect(renderAllMessages).not.toHaveBeenCalled();
    expect(getLlmCredentials).not.toHaveBeenCalled();
    expect(tokenCountForTexts).not.toHaveBeenCalled();
  });

  it("renders and tokenizes only the continuation appended to a checkpoint", async () => {
    const conversation = createConversation(workspace);
    const continuation = {
      ...createConversation(workspace),
      sId: "continuation",
    };
    vi.mocked(renderAllMessages).mockResolvedValue([
      assistantMessage("delta assistant"),
      functionMessage("delta tool", "delta result"),
    ]);
    mockTokenCounter({
      byContains: { "delta assistant": 11, "delta result": 12 },
    });

    const result = await renderConversationWindow(
      auth,
      {
        model,
        prompt: "PROMPT",
        enabledSkills: [],
        tools: "TOOLS",
        allowedTokenCount: 100_000,
      },
      {
        kind: "checkpoint_continuation",
        conversation,
        continuation,
        checkpoint: checkpoint([userMessage("saved user")]),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.modelConversation.messages).toEqual([
      userMessage("saved user"),
      assistantMessage("delta assistant"),
      functionMessage("delta tool", "delta result"),
    ]);
    expect(tokenCountForTexts).toHaveBeenCalledTimes(1);
    expect(tokenCountForTexts).not.toHaveBeenCalledWith(
      ["PROMPT", "TOOLS"],
      model,
      expect.anything()
    );
    expect(renderAllMessages).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ conversation: continuation })
    );
  });

  it("matches a full replay when a continuation crosses a pruning checkpoint", async () => {
    const conversation = createConversation(workspace);
    const continuation = {
      ...createConversation(workspace),
      sId: "continuation",
    };
    const prefixMessages = [
      userMessage("saved user"),
      assistantMessage("tool call"),
      functionMessage("large tool", "large result"),
    ];
    const continuationMessages = [
      assistantMessage("completed"),
      functionMessage("small tool", "small result"),
    ];
    mockTokenCounter({
      byContains: {
        "saved user": 10,
        "tool call": 10,
        "large result": 6_000,
        completed: 10,
        "small result": 10,
      },
    });
    const input = {
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 100,
      }),
    };

    vi.mocked(renderAllMessages).mockResolvedValueOnce(prefixMessages);
    const prefix = await renderConversationWindow(auth, input, {
      kind: "full",
      conversation,
    });
    if (prefix.isErr()) {
      throw prefix.error;
    }
    const sourceCheckpoint = makeConversationWindowCheckpoint({
      identity: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        agentMessageId: "agent_message_1",
        agentMessageVersion: 0,
        step: 0,
      },
      profileHash: "profile",
      ...prefix.value.checkpointData,
    });

    vi.mocked(renderAllMessages).mockResolvedValueOnce(continuationMessages);
    const resumed = await renderConversationWindow(auth, input, {
      kind: "checkpoint_continuation",
      conversation,
      continuation,
      checkpoint: sourceCheckpoint,
    });
    if (resumed.isErr()) {
      throw resumed.error;
    }

    vi.mocked(renderAllMessages).mockResolvedValueOnce([
      ...prefixMessages,
      ...continuationMessages,
    ]);
    const replayed = await renderConversationWindow(auth, input, {
      kind: "full",
      conversation,
    });
    if (replayed.isErr()) {
      throw replayed.error;
    }

    expect(resumed.value).toEqual(replayed.value);
    expect(resumed.value.prunedContext).toBe(true);
  });
});

describe("renderConversationForModel", () => {
  let auth: Authenticator;
  let workspace: LightWorkspaceType;
  const model = {
    ...GPT_4O_MODEL_CONFIG,
    // Large enough that PRUNING_TARGET_CONTEXT_UTILIZATION never becomes the binding constraint
    // in these tests, which are all sized in the low hundreds of tokens, unless explicitly
    // overridden.
    contextSize: 200_000,
  };

  beforeEach(async () => {
    ({ authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    }));
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({});
  });

  it("returns all messages when they fit", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("u1"),
      assistantMessage("a1"),
      functionMessage("tool_1", "f1"),
    ]);
    mockTokenCounter({
      byContains: { u1: 10, a1: 10, f1: 10 },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 30,
        availableDelta: 100,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    expect(res.value.modelConversation.messages).toHaveLength(3);
    expect(res.value.tokensUsed).toBe(1071);
    expect(res.value.prunedContext).toBe(false);
  });

  it("prunes old tool outputs globally across separate interactions", async () => {
    const messages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => [
      userMessage(`u_${i}`),
      assistantMessage(`a_${i}`),
      functionMessage(`tool_${i}`, `result_${i}`),
    ]);
    vi.mocked(renderAllMessages).mockResolvedValue(messages);
    mockTokenCounter({
      byContains: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => [
          [`u_${i}`, 10],
          [`a_${i}`, 10],
          [`result_${i}`, 5000],
        ])
      ),
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // The hard limit is 51k. Chronological replay prunes old results in stable batches while
      // preserving the latest result of whichever interaction is current at each prefix.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 51_000,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const tool1 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_1"
    );
    const tool2 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_2"
    );
    const tool4 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_4"
    );
    const tool5 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_5"
    );
    const tool12 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_12"
    );
    expect(tool1.content).toContain("This tool result is no longer available");
    expect(tool2.content).toContain("This tool result is no longer available");
    expect(tool4.content).toContain("This tool result is no longer available");
    expect(tool5.content).toContain("This tool result is no longer available");
    expect(tool12.content).toBe("result_12");
    expect(res.value.prunedContext).toBe(false);
  });

  it("prunes a long current turn in a checkpoint and preserves its latest result", async () => {
    const indices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const steps = indices.flatMap((i) => [
      assistantMessage(`thinking_${i}`),
      functionMessage(`step_${i}`, `step_${i}_result_big`),
    ]);
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("the_question"),
      ...steps,
      assistantMessage("final_answer"),
    ]);
    mockTokenCounter({
      byContains: Object.fromEntries([
        ["the_question", 10],
        ["final_answer", 10],
        ...indices.flatMap((i) => [
          [`thinking_${i}`, 10],
          [`step_${i}_result_big`, 5000],
        ]),
      ]),
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Total unpruned is 60_140. The eligible prefix is pruned in one buffered batch while the
      // latest unconsumed result batch remains intact.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 51_000,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const step1 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_1"
    );
    const step2 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_2"
    );
    const step8 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_8"
    );
    const step9 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_9"
    );
    const step12 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_12"
    );
    expect(step1.content).toContain("This tool result is no longer available");
    expect(step2.content).toContain("This tool result is no longer available");
    expect(step8.content).toBe("step_8_result_big");
    expect(step9.content).toBe("step_9_result_big");
    expect(step12.content).toBe("step_12_result_big");
    expect(res.value.prunedContext).toBe(true);
  });

  it("proactively prunes once the conversation crosses PRUNING_TARGET_CONTEXT_UTILIZATION of contextSize, even though allowedTokenCount alone would comfortably fit it", async () => {
    // The old interaction prefix contains more than one 20k checkpoint of prunable payload.
    // contextSize 55_000 gives a proactive target of 31_959 tokens after base tokens, below the
    // 36_240-token full history but well below the hard ceiling configured below.
    const messages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => [
      userMessage(`u_${i}`),
      assistantMessage(`a_${i}`),
      functionMessage(`tool_${i}`, `result_${i}`),
    ]);
    vi.mocked(renderAllMessages).mockResolvedValue(messages);
    mockTokenCounter({
      byContains: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => [
          [`u_${i}`, 10],
          [`a_${i}`, 10],
          [`result_${i}`, 3_000],
        ])
      ),
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model: { ...model, contextSize: 55_000 },
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // The real ceiling comfortably fits everything in full, proving that the soft target is
      // what triggers pruning.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 50_000,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const tool1 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_1"
    );
    const tool12 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_12"
    );
    expect(tool1.content).toContain("no longer available");
    expect(tool12.content).toBe("result_12");
  });

  it("keeps complete interactions when non-tool history exceeds the nominal budget", async () => {
    const previousInteractions = [1, 2, 3, 4, 5].flatMap((i) => [
      userMessage(`old_user_${i}_big`),
      assistantMessage(`old_assistant_${i}_big`),
    ]);
    vi.mocked(renderAllMessages).mockResolvedValue([
      ...previousInteractions,
      userMessage("new_user"),
      assistantMessage("new_assistant"),
    ]);
    mockTokenCounter({
      byContains: Object.fromEntries([
        ...[1, 2, 3, 4, 5].flatMap((i) => [
          [`old_user_${i}_big`, 200],
          [`old_assistant_${i}_big`, 200],
        ]),
        ["new_user", 10],
        ["new_assistant", 10],
      ]),
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 450,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const survivingUserTexts = res.value.modelConversation.messages
      .filter(isUserMessage)
      .map((m) => textOf(m.content[0]));
    expect(survivingUserTexts).toContain("old_user_1_big");
    expect(survivingUserTexts).toContain("new_user");
    expect(res.value.prunedContext).toBe(false);
  });

  it("merges content fragment into following user message when both survive", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      contentFragmentMessage("fragment_text"),
      userMessage("user_text"),
      assistantMessage("assistant_text"),
      functionMessage("tool_1", "tool_output"),
    ]);
    mockTokenCounter({
      byContains: {
        fragment_text: 10,
        user_text: 10,
        assistant_text: 10,
        tool_output: 10,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 40,
        availableDelta: 100,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const roles = res.value.modelConversation.messages.map((m) => m.role);
    expect(roles).not.toContain("content_fragment");

    const firstUser = res.value.modelConversation.messages.find(isUserMessage);
    if (!firstUser) {
      throw new Error("Expected a user message");
    }
    expect(textOf(firstUser.content[0])).toBe("fragment_text");
    expect(textOf(firstUser.content[1])).toBe("user_text");
  });

  it("keeps complete history past the nominal budget", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("BIG_USER"),
      assistantMessage("BIG_ASSISTANT"),
    ]);
    mockTokenCounter({
      byContains: {
        BIG_USER: 60,
        BIG_ASSISTANT: 60,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 49,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }
    expect(res.value.modelConversation.messages).toHaveLength(2);
  });

  it("returns a distinct error, not a context-window one, when the conversation has no messages at all", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([]);
    mockTokenCounter({ byContains: {} });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 100,
      }),
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("Conversation contains no messages");
    }
  });

  it("handles an empty conversation gracefully even when the budget is already negative", async () => {
    // Regression: baseTokens (prompt + tools + margin) exceeding allowedTokenCount makes the
    // interactions budget negative. With no interactions at all, the escalation layers used to
    // dereference the last interaction of an empty array and throw instead of returning an Err.
    vi.mocked(renderAllMessages).mockResolvedValue([]);
    mockTokenCounter({ byContains: {} });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: 100,
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("Conversation contains no messages");
    }
  });

  it("bubbles prompt/tools tokenization errors", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([userMessage("u1")]);
    vi.mocked(tokenCountForTexts).mockImplementation(async (texts) => {
      if (texts.length === 2 && texts[0] === "PROMPT" && texts[1] === "TOOLS") {
        return new Err(new Error("prompt/tools tokenization failed"));
      }
      return new Ok([10]);
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 10,
        availableDelta: 100,
      }),
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toBe("prompt/tools tokenization failed");
    }
  });

  it("bubbles message tokenization errors", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([userMessage("u1")]);
    vi.mocked(tokenCountForTexts).mockImplementation(async (texts) => {
      if (texts.length === 2 && texts[0] === "PROMPT" && texts[1] === "TOOLS") {
        return new Ok([10, 10]);
      }
      return new Err(new Error("message tokenization failed"));
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 10,
        availableDelta: 100,
      }),
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toBe("message tokenization failed");
    }
  });

  it("keeps every interaction when small tool results cannot reclaim a useful batch", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("u_01"),
      assistantMessage("a_01"),
      functionMessage("tool_01", "f_01"),
      userMessage("u_02"),
      assistantMessage("a_02"),
      functionMessage("tool_02", "f_02"),
      userMessage("u_03"),
      assistantMessage("a_03"),
      functionMessage("tool_03", "f_03"),
      userMessage("u_04"),
      assistantMessage("a_04"),
      functionMessage("tool_04", "f_04"),
      userMessage("u_05"),
      assistantMessage("a_05"),
      functionMessage("tool_05", "f_05"),
      userMessage("u_06"),
      assistantMessage("a_06"),
      functionMessage("tool_06", "f_06"),
      userMessage("u_07"),
      assistantMessage("a_07"),
      functionMessage("tool_07", "f_07"),
      userMessage("u_08"),
      assistantMessage("a_08"),
      functionMessage("tool_08", "f_08"),
    ]);
    mockTokenCounter({
      byContains: {
        u_01: 30,
        a_01: 30,
        f_01: 30,
        u_02: 30,
        a_02: 30,
        f_02: 30,
        u_03: 30,
        a_03: 30,
        f_03: 30,
        u_04: 30,
        a_04: 30,
        f_04: 30,
        u_05: 30,
        a_05: 30,
        f_05: 30,
        u_06: 30,
        a_06: 30,
        f_06: 30,
        u_07: 30,
        a_07: 30,
        f_07: 30,
        u_08: 30,
        a_08: 30,
        f_08: 30,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 400,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const functionMessages =
      res.value.modelConversation.messages.filter(isFunctionMessage);
    const names = functionMessages.map((m) => m.name);
    expect(names).toEqual([
      "tool_01",
      "tool_02",
      "tool_03",
      "tool_04",
      "tool_05",
      "tool_06",
      "tool_07",
      "tool_08",
    ]);
    expect(functionMessages.map((message) => message.content)).toEqual([
      "f_01",
      "f_02",
      "f_03",
      "f_04",
      "f_05",
      "f_06",
      "f_07",
      "f_08",
    ]);
  });

  it("prepends leading messages", async () => {
    const leadingMessage = {
      role: "user" as const,
      name: "user",
      content: [{ type: "text" as const, text: "preface" }],
    };

    vi.mocked(renderAllMessages).mockResolvedValue([userMessage("rendered")]);
    mockTokenCounter({
      byContains: {
        preface: 10,
        rendered: 10,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(workspace),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 20,
        availableDelta: 100,
      }),
      leadingMessages: [leadingMessage],
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    expect(res.value.modelConversation.messages).toEqual([
      leadingMessage,
      userMessage("rendered"),
    ]);
  });

  it("keeps complete interaction history stable as the conversation grows", async () => {
    const nonPrunableHistory = Array.from(
      { length: 4 },
      (_, index) => index + 1
    ).flatMap((i) => [
      userMessage(`old_user_${i}`),
      assistantMessage(`old_assistant_${i}`),
    ]);
    const initiallyProtectedHistory = Array.from(
      { length: 3 },
      (_, index) => index + 5
    ).flatMap((i) => [
      userMessage(`old_user_${i}`),
      assistantMessage(`old_assistant_${i}`),
      functionMessage(`old_tool_${i}`, `old_result_${i}`),
    ]);
    const history = [...nonPrunableHistory, ...initiallyProtectedHistory];
    const extendedHistory = [
      ...history,
      ...Array.from({ length: 3 }, (_, index) => index + 1).flatMap((i) => [
        userMessage(`new_user_${i}`),
        assistantMessage(`new_assistant_${i}`),
        functionMessage(`new_tool_${i}`, `new_result_${i}`),
      ]),
    ];

    vi.mocked(renderAllMessages)
      .mockResolvedValueOnce(history)
      .mockResolvedValueOnce(extendedHistory);
    mockTokenCounter({
      byContains: Object.fromEntries([
        ...Array.from({ length: 4 }, (_, index) => index + 1).flatMap((i) => [
          [`old_user_${i}`, 5_000],
          [`old_assistant_${i}`, 5_000],
        ]),
        ...Array.from({ length: 3 }, (_, index) => index + 5).flatMap((i) => [
          [`old_user_${i}`, 5],
          [`old_assistant_${i}`, 5],
          [`old_result_${i}`, 5_000],
        ]),
        ...Array.from({ length: 3 }, (_, index) => index + 1).flatMap((i) => [
          [`new_user_${i}`, 5],
          [`new_assistant_${i}`, 5],
          [`new_result_${i}`, 100],
        ]),
      ]),
    });

    const render = () =>
      renderConversationForModel(auth, {
        conversation: createConversation(workspace),
        model,
        prompt: "PROMPT",
        enabledSkills: [],
        tools: "TOOLS",
        allowedTokenCount: computeAllowedTokenCount({
          promptTokens: 10,
          toolsTokens: 10,
          interactionTokens: 15_500,
        }),
      });

    const first = await render();
    const second = await render();

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) {
      return;
    }

    const firstUserTexts = first.value.modelConversation.messages
      .filter(isUserMessage)
      .map((message) => textOf(message.content[0]));
    const secondUserTexts = second.value.modelConversation.messages
      .filter(isUserMessage)
      .map((message) => textOf(message.content[0]));

    expect(firstUserTexts).toContain("old_user_1");
    expect(secondUserTexts).toContain("old_user_1");
    expect(secondUserTexts).toContain("new_user_3");
  });
});
