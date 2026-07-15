import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type {
  Content,
  FunctionMessageTypeModel,
  ModelMessageTypeMultiActions,
  UserMessageTypeModel,
} from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";
import { Err, Ok } from "@app/types/shared/result";
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
  getStatsDClient: () => ({
    distribution: vi.fn(),
    increment: vi.fn(),
  }),
}));

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

function createConversation() {
  return {
    sId: "conv_1",
    owner: { sId: "w_1" },
    content: [],
  } as any;
}

function userMessage(text: string, name = "user"): UserMessageTypeModel {
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

describe("renderConversationForModel", () => {
  const auth = {} as any;
  const model = {
    providerId: "openai",
    modelId: "gpt-4.1",
    tokenizer: "cl100k_base",
    // Large enough that PRUNING_TARGET_CONTEXT_UTILIZATION never becomes the binding constraint
    // in these tests, which are all sized in the low hundreds of tokens, unless explicitly
    // overridden.
    contextSize: 200_000,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({} as any);
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
      conversation: createConversation(),
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

  it("prunes old tool outputs beyond TOOL_RESULTS_TO_PRESERVE but keeps the most recent ones, across separate interactions", async () => {
    // 12 interactions (TOOL_RESULTS_TO_PRESERVE is 10), each with one tool call: the first 2 are
    // outside the preserved window and must be pruned. The last 10 are the protected floor and
    // must survive untouched, regardless of budget-driven checkpoint search.
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
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Total unpruned: 12 * 5020 = 60_240. Pruning the 2 eligible tool results (outside the
      // floor of 10) saves 2 * (5000 - 24) = 9_952, bringing it to 50_288, comfortably under
      // this budget. Nothing else needs to be touched.
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
    const tool3 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_3"
    );
    const tool12 = getFunctionMessage(
      res.value.modelConversation.messages,
      "tool_12"
    );
    expect(tool1.content).toContain("This tool result is no longer available");
    expect(tool2.content).toContain("This tool result is no longer available");
    expect(tool3.content).toBe("result_3");
    expect(tool12.content).toBe("result_12");
    expect(res.value.prunedContext).toBe(true);
  });

  it("prunes a single turn's OWN earlier tool-call steps once it makes many tool calls, since the current turn gets no special exemption", async () => {
    // ONE continuous interaction: a single user question answered via 12 tool-call steps before
    // the final reply. Nothing here is a "previous interaction", it's all the current turn, yet
    // its own earliest steps (beyond TOOL_RESULTS_TO_PRESERVE=10) still get pruned.
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
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Total unpruned: 10 (question) + 12*(10+5000) + 10 (answer) = 60_140. Pruning the 2
      // steps outside the floor of 10 saves 2 * (5000-24) = 9_952 -> 50_188, under this budget.
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
    const step3 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_3"
    );
    const step12 = getFunctionMessage(
      res.value.modelConversation.messages,
      "step_12"
    );
    expect(step1.content).toContain("This tool result is no longer available");
    expect(step2.content).toContain("This tool result is no longer available");
    expect(step3.content).toBe("step_3_result_big");
    expect(step12.content).toBe("step_12_result_big");
    expect(res.value.prunedContext).toBe(true);
  });

  it("proactively prunes once the conversation crosses PRUNING_TARGET_CONTEXT_UTILIZATION of contextSize, even though allowedTokenCount alone would comfortably fit it", async () => {
    // 12 small interactions (TOOL_RESULTS_TO_PRESERVE=10, so 2 fall outside the floor). contextSize
    // 4_000 gives a proactive target of 1_359 tokens (baseTokens=1041, so 4_000*0.6 - 1041):
    // comfortably above the 1_288 tokens left after pruning the 2 eligible tool results, but
    // well below the 1_440 unpruned total, so the proactive target is what forces the
    // pruning, not the real ceiling, which is set far higher below.
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
          [`result_${i}`, 100],
        ])
      ),
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model: { ...model, contextSize: 4_000 },
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Real ceiling comfortably fits everything (1_440) in full: proves pruning is driven by
      // the proactive target, not by running out of the real budget.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 20_000,
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

  it("drops a whole previous interaction entirely, not just its tool result, when pruning alone still doesn't fit", async () => {
    // Ten previous interactions, each dominated by large USER/ASSISTANT text (never pruned by
    // pruneToolResults) rather than tool output. Pruning alone cannot shrink these enough, so
    // dropInteractionsToFit must remove some of them wholesale.
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
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Each old interaction costs 400 tokens. Budget only leaves room for the current (20) plus
      // roughly one old interaction (400), nowhere near all 5 (2000).
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
    // Oldest interactions are dropped first. The newest ones (closest to "new_user") survive.
    expect(survivingUserTexts).not.toContain("old_user_1_big");
    expect(survivingUserTexts).toContain("new_user");
  });

  it("drops a content fragment TOGETHER WITH its user message when the whole interaction is dropped, never separates them", async () => {
    // The oldest interaction carries a content fragment (e.g. a file upload) immediately before
    // its user message. When that whole interaction is dropped for space, the content fragment
    // must go with it, never survive alone with no user message to merge into.
    vi.mocked(renderAllMessages).mockResolvedValue([
      contentFragmentMessage("uploaded_file_big"),
      userMessage("old_user_big"),
      assistantMessage("old_assistant_big"),
      userMessage("new_user"),
      assistantMessage("new_assistant"),
    ]);
    mockTokenCounter({
      byContains: {
        uploaded_file_big: 300,
        old_user_big: 200,
        old_assistant_big: 200,
        new_user: 10,
        new_assistant: 10,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // Budget only fits the current interaction (20 tokens). The 700-token old interaction
      // (content fragment + user + assistant) must be dropped as a whole.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 50,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const roles = res.value.modelConversation.messages.map((m) => m.role);
    // No dangling content_fragment role should ever reach the final output (they're merged into
    // user messages, or dropped together with them), this asserts the merge-or-drop invariant
    // held even though the interaction carrying the fragment was entirely dropped.
    expect(roles).not.toContain("content_fragment");

    const survivingUserTexts = res.value.modelConversation.messages
      .filter(isUserMessage)
      .map((m) => textOf(m.content[0]));
    expect(survivingUserTexts).not.toContain("old_user_big");
    expect(survivingUserTexts).toContain("new_user");
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
      conversation: createConversation(),
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

  it("returns an error when context window is still exceeded after every pruning layer", async () => {
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
      conversation: createConversation(),
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

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain(
        "Context window exceeded: at least one message is required"
      );
    }
  });

  it("returns a distinct error, not a context-window one, when the conversation has no messages at all", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([]);
    mockTokenCounter({ byContains: {} });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
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
      conversation: createConversation(),
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
      conversation: createConversation(),
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
      conversation: createConversation(),
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

  it("keeps the most recent interactions first when limited by budget", async () => {
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

    // Each interaction is 90 tokens (30 + 30 + 30), well within TOOL_RESULTS_TO_PRESERVE (10 tool
    // results total here), so Layer 1 (pruning) can't touch any of them at all, this is meant
    // to exercise Layer 2 (drop-entirely) in isolation, not cascade into Layer 3's force-pruning.
    //
    // Hand-verified: total unpruned = 8 * 90 = 720. Layer 2's target for the 7 previous
    // interactions is budgetForInteractions(400) - current's cost(90) = 310. With
    // PREVIOUS_INTERACTIONS_TO_PRESERVE=3, i1-i4 (4 * 90 = 360) can be dropped, leaving the
    // protected floor i5-i7 (3 * 90 = 270) plus current i8 (90) = 360 <= 400: Layer 2 alone gets
    // under budget, so Layer 3/4 never fire and i5-i8 survive WITH THEIR REAL, UNPRUNED CONTENT.
    // An earlier version of this test only checked message names, which stay the same whether
    // a tool result is pruned or not, and so couldn't actually tell the difference.
    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
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
    expect(names).toEqual(["tool_05", "tool_06", "tool_07", "tool_08"]);
    expect(names).not.toContain("tool_01");
    expect(names).not.toContain("tool_02");
    expect(names).not.toContain("tool_03");
    expect(names).not.toContain("tool_04");

    // The surviving tool results carry their REAL content, not a pruning placeholder,
    // confirming Layer 2 (drop) alone was enough, and Layer 3 (force-prune) never fired.
    for (const [i, name] of ["f_05", "f_06", "f_07", "f_08"].entries()) {
      expect(functionMessages[i].content).toBe(name);
    }
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
      conversation: createConversation(),
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

  it("never drops leading messages when pruning old interactions", async () => {
    const leadingMessage = userMessage("equipped_skills");
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("old_user_1"),
      assistantMessage("old_assistant_1"),
      userMessage("old_user_2"),
      assistantMessage("old_assistant_2"),
      userMessage("old_user_3"),
      assistantMessage("old_assistant_3"),
      userMessage("new_user"),
      assistantMessage("new_assistant"),
    ]);
    mockTokenCounter({
      byContains: {
        equipped_skills: 10,
        old_user_1: 200,
        old_assistant_1: 200,
        old_user_2: 200,
        old_assistant_2: 200,
        old_user_3: 200,
        old_assistant_3: 200,
        new_user: 10,
        new_assistant: 10,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 450,
      }),
      leadingMessages: [leadingMessage],
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    expect(res.value.modelConversation.messages[0]).toEqual(leadingMessage);
    expect(res.value.modelConversation.messages).not.toContainEqual(
      userMessage("old_user_1")
    );
  });
});
