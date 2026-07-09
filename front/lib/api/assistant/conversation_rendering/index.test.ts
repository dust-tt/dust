import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
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

  it("prunes current interaction progressively when it exceeds budget", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("curr_user"),
      assistantMessage("curr_assistant"),
      functionMessage("curr_tool", "curr_function_big"),
    ]);
    mockTokenCounter({
      byContains: {
        curr_user: 10,
        curr_assistant: 10,
        curr_function_big: 80,
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
        interactionTokens: 79,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const functionOutput = res.value.modelConversation.messages.find(
      (m) => m.role === "function"
    );
    expect(functionOutput).toBeDefined();
    expect((functionOutput as any).content).toContain(
      "This tool result is no longer available"
    );
    expect(res.value.prunedContext).toBe(true);
  });

  it("prunes previous interactions tool outputs and keeps last interaction", async () => {
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("old_user"),
      assistantMessage("old_assistant"),
      functionMessage("old_tool", "old_function_big"),
      userMessage("new_user"),
      assistantMessage("new_assistant"),
      functionMessage("new_tool", "new_function"),
    ]);
    mockTokenCounter({
      byContains: {
        old_user: 20,
        old_assistant: 20,
        old_function_big: 200,
        new_user: 20,
        new_assistant: 20,
        new_function: 20,
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
        interactionTokens: 212,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const oldTool = res.value.modelConversation.messages.find(
      (m: any) => m.role === "function" && m.name === "old_tool"
    );
    const newTool = res.value.modelConversation.messages.find(
      (m: any) => m.role === "function" && m.name === "new_tool"
    );
    expect(oldTool).toBeDefined();
    expect((oldTool as any).content).toContain(
      "This tool result is no longer available"
    );
    expect(newTool).toBeDefined();
    expect((newTool as any).content).toBe("new_function");
    expect(res.value.prunedContext).toBe(false);
  });

  it("merges content fragment into following user message", async () => {
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

    const firstUser = res.value.modelConversation.messages.find(
      (m) => m.role === "user"
    ) as any;
    expect(firstUser).toBeDefined();
    expect(firstUser.content[0].text).toBe("fragment_text");
    expect(firstUser.content[1].text).toBe("user_text");
  });

  it("returns an error when context window is still exceeded after pruning", async () => {
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

  it("does not error when previousInteractions' floor alone overflows its budget, as long as the current interaction fits on its own", async () => {
    // Three previous interactions, ALL inside the floor (PREVIOUS_INTERACTIONS_TO_PRESERVE = 3),
    // each large enough that even fully redacted they still add up to more than
    // budgetForInteractions (100 below). This is prunePreviousInteractions' own rare "real
    // out-of-room" case (see its floor-redaction fallback).
    //
    // The current interaction is small and has no tool call of its own, so it comfortably fits
    // budgetForInteractions on its own. The fix under test: the hard error check compares the
    // current interaction against the FULL fixed pool (budgetForInteractions), not against
    // whatever's nominally left after previousInteractions (which went negative here). So this
    // must still succeed, leaning on the pre-existing "select interactions that fit" loop to trim
    // previousInteractions down further rather than failing the whole render.
    vi.mocked(renderAllMessages).mockResolvedValue([
      userMessage("floor1_user"),
      assistantMessage("floor1_assistant"),
      functionMessage("floor1_tool", "floor1_tool_content"),
      userMessage("floor2_user"),
      assistantMessage("floor2_assistant"),
      functionMessage("floor2_tool", "floor2_tool_content"),
      userMessage("floor3_user"),
      assistantMessage("floor3_assistant"),
      functionMessage("floor3_tool", "floor3_tool_content"),
      userMessage("cur_user"),
      assistantMessage("cur_assistant"),
    ]);
    mockTokenCounter({
      byContains: {
        floor1_user: 20,
        floor1_assistant: 20,
        floor1_tool_content: 300,
        floor2_user: 20,
        floor2_assistant: 20,
        floor2_tool_content: 300,
        floor3_user: 20,
        floor3_assistant: 20,
        floor3_tool_content: 300,
        cur_user: 10,
        cur_assistant: 10,
      },
    });

    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      // budgetForInteractions = 100: far less than the floor's real size (3 * 340 = 1020) or even
      // its fully-redacted minimum (3 * 64 = 192), but comfortably more than the current
      // interaction's own 20 tokens.
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 100,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const currentUser = res.value.modelConversation.messages.find(
      (m: any) => m.role === "user" && m.content[0].text === "cur_user"
    );
    expect(currentUser).toBeDefined();

    // previousInteractions couldn't all survive, but the render degraded gracefully instead of
    // failing outright: at least one floor interaction made it through, redacted.
    const survivingFloorTools = res.value.modelConversation.messages.filter(
      (m: any) => m.role === "function"
    );
    expect(survivingFloorTools.length).toBeGreaterThan(0);
    for (const tool of survivingFloorTools) {
      expect((tool as any).content).toContain("no longer available");
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

    // Each interaction is 90 tokens (30 + 30 + 30).
    // Budget below allows exactly 2 interactions to fit after base tokens:
    // interaction budget = 189 => 2 * 90 = 180 fits, 3 * 90 = 270 does not.
    const res = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount: computeAllowedTokenCount({
        promptTokens: 10,
        toolsTokens: 10,
        interactionTokens: 189,
      }),
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      return;
    }

    const names = res.value.modelConversation.messages
      .filter((m: any) => m.role === "function")
      .map((m: any) => m.name);
    expect(names).toEqual(["tool_07", "tool_08"]);
    expect(names).not.toContain("tool_01");
    expect(names).not.toContain("tool_02");
    expect(names).not.toContain("tool_03");
    expect(names).not.toContain("tool_04");
    expect(names).not.toContain("tool_05");
    expect(names).not.toContain("tool_06");
  });

  it("renders previous interactions identically across turns, regardless of how big the current interaction happens to be", async () => {
    // Four previous interactions (i1..i4), each 70 tokens (10 user + 10 assistant + 50 tool),
    // comfortably within budgetForInteractions on their own. Prior to the fix, this scenario used
    // to drop i2/i3/i4 entirely on the turn where the current interaction grew large, purely
    // because current and previousInteractions shared one live pool in the final selection loop.
    // Now previousInteractions gets a fixed, current-independent claim on the budget, so its
    // rendering must be byte-identical across both calls below.
    const previousInteractionMessages = [
      userMessage("i1_user"),
      assistantMessage("i1_assistant"),
      functionMessage("i1_tool", "i1_tool_content"),
      userMessage("i2_user"),
      assistantMessage("i2_assistant"),
      functionMessage("i2_tool", "i2_tool_content"),
      userMessage("i3_user"),
      assistantMessage("i3_assistant"),
      functionMessage("i3_tool", "i3_tool_content"),
      userMessage("i4_user"),
      assistantMessage("i4_assistant"),
      functionMessage("i4_tool", "i4_tool_content"),
    ];
    const byContains = {
      i1_user: 10,
      i1_assistant: 10,
      i1_tool_content: 50,
      i2_user: 10,
      i2_assistant: 10,
      i2_tool_content: 50,
      i3_user: 10,
      i3_assistant: 10,
      i3_tool_content: 50,
      i4_user: 10,
      i4_assistant: 10,
      i4_tool_content: 50,
      cur_user_small: 10,
      cur_assistant_small: 10,
      cur_user_big: 10,
      cur_assistant_big: 10,
      cur_tool_big_content: 200,
    };

    // Same allowedTokenCount on both calls, same model, same context window. The only thing that
    // differs between "turn T" and "turn T+1" is how big the new current-turn content is.
    // budgetForInteractions = 400 comfortably covers i1..i4 (4 * 70 = 280) on its own.
    const allowedTokenCount = computeAllowedTokenCount({
      promptTokens: 10,
      toolsTokens: 10,
      interactionTokens: 400,
    });

    // Turn T: current interaction is small (20 tokens: just user + assistant, no tool call).
    vi.mocked(renderAllMessages).mockResolvedValue([
      ...previousInteractionMessages,
      userMessage("cur_user_small"),
      assistantMessage("cur_assistant_small"),
    ]);
    mockTokenCounter({ byContains });

    const turnT = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount,
    });
    expect(turnT.isOk()).toBe(true);
    if (turnT.isErr()) {
      return;
    }

    const previousMessagesAtTurnT = turnT.value.modelConversation.messages
      .filter(
        (m: any) => typeof m.name === "string" && m.name.startsWith("i") // i1_tool..i4_tool, not "cur_*"
      )
      .map((m: any) => ({ role: m.role, name: m.name, content: m.content }));

    // All four previous interactions are rendered in full at turn T.
    const toolNamesAtTurnT = previousMessagesAtTurnT
      .filter((m: any) => m.role === "function")
      .map((m: any) => m.name);
    expect(toolNamesAtTurnT).toEqual([
      "i1_tool",
      "i2_tool",
      "i3_tool",
      "i4_tool",
    ]);
    for (const i of [1, 2, 3, 4]) {
      const tool = previousMessagesAtTurnT.find(
        (m: any) => m.name === `i${i}_tool`
      ) as any;
      expect(tool.content).toBe(`i${i}_tool_content`);
    }

    // Turn T+1: i1..i4 are byte-for-byte identical to turn T. The ONLY change is that this
    // turn's new current interaction now includes a big tool call (220 tokens instead of 20),
    // exactly like a user turn that happens to trigger a large tool result.
    vi.mocked(renderAllMessages).mockResolvedValue([
      ...previousInteractionMessages,
      userMessage("cur_user_big"),
      assistantMessage("cur_assistant_big"),
      functionMessage("cur_tool_big", "cur_tool_big_content"),
    ]);
    mockTokenCounter({ byContains });

    const turnTPlus1 = await renderConversationForModel(auth, {
      conversation: createConversation(),
      model,
      prompt: "PROMPT",
      enabledSkills: [],
      tools: "TOOLS",
      allowedTokenCount, // same context window budget as turn T
    });
    expect(turnTPlus1.isOk()).toBe(true);
    if (turnTPlus1.isErr()) {
      return;
    }

    const previousMessagesAtTurnTPlus1 =
      turnTPlus1.value.modelConversation.messages
        .filter(
          (m: any) => typeof m.name === "string" && m.name.startsWith("i")
        )
        .map((m: any) => ({ role: m.role, name: m.name, content: m.content }));

    // Byte-identical to turn T: none of i1..i4 moved, despite the current interaction growing
    // from 20 to 220 tokens.
    expect(previousMessagesAtTurnTPlus1).toEqual(previousMessagesAtTurnT);

    // The current interaction itself is free to vary. It's new content, never previously cached,
    // and its own tool result gets progressively pruned since it doesn't fit its ideal share of
    // the budget on its own.
    const currentToolAtTurnTPlus1 =
      turnTPlus1.value.modelConversation.messages.find(
        (m: any) => m.name === "cur_tool_big"
      ) as any;
    expect(currentToolAtTurnTPlus1).toBeDefined();
    expect(currentToolAtTurnTPlus1.content).toContain("no longer available");
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
});
