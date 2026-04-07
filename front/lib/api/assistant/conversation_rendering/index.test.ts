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
      "Warning: the content of this function result was pruned"
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
      "This function result is no longer available."
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
});
