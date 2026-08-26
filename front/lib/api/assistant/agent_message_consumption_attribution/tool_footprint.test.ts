import { getEnabledSkillInputTextByActionId } from "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint";
import type { ToolCallFootprintInput } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import {
  measureToolCallFootprints,
  toolCallFootprintTexts,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { GEMINI_3_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { STATIC_MODEL_IDS } from "@app/types/assistant/models/models";
import {
  GPT_4_1_MODEL_CONFIG,
  GPT_4O_20240806_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_MODEL_ID,
} from "@app/types/assistant/models/openai";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock(
  "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint",
  () => ({
    getEnabledSkillInputTextByActionId: vi.fn(async () => new Map()),
  })
);

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

function makeAction(
  overrides: Partial<AgentMCPActionWithOutputType> = {}
): AgentMCPActionWithOutputType {
  return {
    id: 1,
    sId: "action_1",
    createdAt: 0,
    updatedAt: 0,
    agentMessageId: 1,
    internalMCPServerName: null,
    toolName: "search",
    mcpServerId: null,
    functionCallName: "search",
    functionCallId: "call_1",
    params: { query: "hello" },
    citationsAllocated: 0,
    status: "succeeded",
    step: 0,
    executionDurationMs: null,
    displayLabels: null,
    output: null,
    generatedFiles: [],
    ...overrides,
  };
}

// The emitted arguments are supplied separately from the resource, so tests default them to "{}".
function footprintInput(
  action: AgentMCPActionWithOutputType,
  functionCallArguments = "{}"
): ToolCallFootprintInput {
  return { action, functionCallArguments };
}

// The auth is only forwarded to getLlmCredentials, which is mocked, so a bare stub is enough.
const auth = {} as Authenticator;

describe("toolCallFootprintTexts", () => {
  it("serializes a call from the emitted arguments, not the augmented params", () => {
    const { callText } = toolCallFootprintTexts(
      footprintInput(
        makeAction({
          functionCallName: "search",
          // params also carries a Dust-injected input that must not be counted.
          params: { query: "hello", injectedSecret: "x".repeat(500) },
        }),
        '{"query":"hello"}'
      )
    );

    expect(callText).toBe('search\n{"query":"hello"}');
  });

  it("renders a denied action as the rejection notice, ignoring any output", () => {
    const { inputText } = toolCallFootprintTexts(
      footprintInput(
        makeAction({
          status: "denied",
          output: [{ type: "text", text: "leaked" }],
        })
      )
    );

    expect(inputText).toBe(
      "The user rejected or skipped this specific action execution. Using this action is hence forbidden for this message."
    );
  });

  it("renders an action awaiting validation as the validation notice", () => {
    const { inputText } = toolCallFootprintTexts(
      footprintInput(makeAction({ status: "blocked_validation_required" }))
    );

    expect(inputText).toBe(
      "The user must manually validate this action before it can be executed."
    );
  });

  it("renders an empty output as the no-output notice", () => {
    const { inputText } = toolCallFootprintTexts(
      footprintInput(makeAction({ status: "succeeded", output: [] }))
    );

    expect(inputText).toBe("Successfully executed action, no output.");
  });

  it("joins text output items with newlines", () => {
    const { inputText } = toolCallFootprintTexts(
      footprintInput(
        makeAction({
          status: "succeeded",
          output: [
            { type: "text", text: "first" },
            { type: "text", text: "second" },
          ],
        })
      )
    );

    expect(inputText).toBe("first\nsecond");
  });

  it("serializes non-text output as JSON with the mime type stripped", () => {
    const { inputText } = toolCallFootprintTexts(
      footprintInput(
        makeAction({
          status: "succeeded",
          output: [
            {
              type: "resource",
              resource: { uri: "u", mimeType: "text/plain", text: "body" },
            },
          ],
        })
      )
    );

    expect(inputText).toBe(JSON.stringify([{ uri: "u", text: "body" }]));
  });
});

describe("measureToolCallFootprints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    // Count is the character length of each text, keeping the assertions readable.
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map((text) => text.length))
    );
  });

  it("omits deferred enabled-skill definitions for an Anthropic tool-search model", async () => {
    await measureToolCallFootprints(auth, {
      modelId: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
      toolCalls: [footprintInput(makeAction())],
    });

    expect(getEnabledSkillInputTextByActionId).toHaveBeenCalledWith(
      auth,
      expect.any(Array),
      { toolSearchEnabled: true }
    );
  });

  it("includes enabled-skill definitions when tool search is disabled", async () => {
    await measureToolCallFootprints(auth, {
      modelId: GPT_4_1_MODEL_CONFIG.modelId,
      toolCalls: [footprintInput(makeAction())],
    });

    expect(getEnabledSkillInputTextByActionId).toHaveBeenCalledWith(
      auth,
      expect.any(Array),
      { toolSearchEnabled: false }
    );
  });

  it("returns an empty result without tokenizing when there are no actions", async () => {
    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      toolCalls: [],
    });

    expect(res.isOk() && res.value).toEqual([]);
    expect(tokenCountForTexts).not.toHaveBeenCalled();
    expect(getLlmCredentials).not.toHaveBeenCalled();
  });

  it("fails when the run's model is not a known configuration", async () => {
    const res = await measureToolCallFootprints(auth, {
      modelId: "not-a-real-model",
      toolCalls: [footprintInput(makeAction())],
    });

    expect(res.isErr()).toBe(true);
    expect(tokenCountForTexts).not.toHaveBeenCalled();
  });

  // Static IDs are retained for stored runs and pricing after serving retirement. This contract
  // fails when a model leaves SUPPORTED_MODEL_CONFIGS without joining the historical allowlist.
  it.each(STATIC_MODEL_IDS)(
    "keeps a tool-footprint tokenizer configuration for static model %s",
    async (modelId) => {
      const res = await measureToolCallFootprints(auth, {
        modelId,
        toolCalls: [footprintInput(makeAction())],
      });

      expect(res.isOk()).toBe(true);
    }
  );

  it.each([
    GPT_4_1_MODEL_CONFIG,
    GPT_4O_20240806_MODEL_CONFIG,
    CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
    GEMINI_3_FLASH_MODEL_CONFIG,
  ])(
    "tokenizes historical $modelId runs whose model is no longer served",
    async (modelConfig) => {
      const res = await measureToolCallFootprints(auth, {
        modelId: modelConfig.modelId,
        toolCalls: [footprintInput(makeAction())],
      });

      expect(res.isOk()).toBe(true);
      expect(tokenCountForTexts).toHaveBeenCalledWith(
        expect.any(Array),
        {
          ...modelConfig,
          tokenCountAdjustment: modelConfig.tokenCountAdjustment ?? 1,
        },
        expect.anything()
      );
    }
  );

  it("tokenizes GPT-5 footprints without safety padding using o200k", async () => {
    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_6_SOL_MODEL_ID,
      toolCalls: [footprintInput(makeAction())],
    });

    expect(res.isOk()).toBe(true);
    expect(tokenCountForTexts).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        modelId: GPT_5_6_SOL_MODEL_ID,
        tokenCountAdjustment: 1,
        tokenizer: { type: "tiktoken", base: "o200k_base" },
      }),
      expect.anything()
    );
  });

  it("measures the call and result footprint of each action, aligned by position", async () => {
    const toolCalls = [
      footprintInput(makeAction({ functionCallName: "a" })),
      footprintInput(
        makeAction({
          functionCallName: "b",
          status: "succeeded",
          output: [{ type: "text", text: "result-of-b" }],
        })
      ),
    ];

    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      toolCalls,
    });

    // Calls and inputs are tokenized as two homogeneous lists, each in input order.
    const [callTexts] = vi.mocked(tokenCountForTexts).mock.calls[0];
    const [inputTexts] = vi.mocked(tokenCountForTexts).mock.calls[1];
    expect(callTexts).toEqual(["a\n{}", "b\n{}"]);
    expect(inputTexts).toEqual([
      "Successfully executed action, no output.",
      "result-of-b",
    ]);

    expect(res.isOk() && res.value).toEqual([
      {
        callOutputTokensCount: "a\n{}".length,
        inputTokensCount: "Successfully executed action, no output.".length,
      },
      {
        callOutputTokensCount: "b\n{}".length,
        inputTokensCount: "result-of-b".length,
      },
    ]);
  });

  it("propagates a tokenizer failure", async () => {
    vi.mocked(tokenCountForTexts).mockResolvedValue(
      new Err(new Error("core down"))
    );

    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      toolCalls: [footprintInput(makeAction())],
    });

    expect(res.isErr() && res.error.message).toBe("core down");
  });
});
