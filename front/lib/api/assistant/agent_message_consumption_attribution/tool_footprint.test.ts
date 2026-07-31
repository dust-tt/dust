import {
  measureToolCallFootprints,
  toolCallFootprintTexts,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { GPT_5_MODEL_ID } from "@app/types/assistant/models/openai";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

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

// The auth is only forwarded to getLlmCredentials, which is mocked, so a bare stub is enough.
const auth = {} as Authenticator;

describe("toolCallFootprintTexts", () => {
  it("serializes a call as its function name followed by JSON arguments", () => {
    const { callText } = toolCallFootprintTexts(
      makeAction({ functionCallName: "search", params: { query: "hello" } })
    );

    expect(callText).toBe(`search\n${JSON.stringify({ query: "hello" })}`);
  });

  it("renders a denied action as the rejection notice, ignoring any output", () => {
    const { resultText } = toolCallFootprintTexts(
      makeAction({
        status: "denied",
        output: [{ type: "text", text: "leaked" }],
      })
    );

    expect(resultText).toBe(
      "The user rejected or skipped this specific action execution. Using this action is hence forbidden for this message."
    );
  });

  it("renders an action awaiting validation as the validation notice", () => {
    const { resultText } = toolCallFootprintTexts(
      makeAction({ status: "blocked_validation_required" })
    );

    expect(resultText).toBe(
      "The user must manually validate this action before it can be executed."
    );
  });

  it("renders an empty output as the no-output notice", () => {
    const { resultText } = toolCallFootprintTexts(
      makeAction({ status: "succeeded", output: [] })
    );

    expect(resultText).toBe("Successfully executed action, no output.");
  });

  it("joins text output items with newlines", () => {
    const { resultText } = toolCallFootprintTexts(
      makeAction({
        status: "succeeded",
        output: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      })
    );

    expect(resultText).toBe("first\nsecond");
  });

  it("serializes non-text output as JSON with the mime type stripped", () => {
    const { resultText } = toolCallFootprintTexts(
      makeAction({
        status: "succeeded",
        output: [
          {
            type: "resource",
            resource: { uri: "u", mimeType: "text/plain", text: "body" },
          },
        ],
      })
    );

    expect(resultText).toBe(JSON.stringify([{ uri: "u", text: "body" }]));
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

  it("returns an empty result without tokenizing when there are no actions", async () => {
    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      actions: [],
    });

    expect(res.isOk() && res.value).toEqual([]);
    expect(tokenCountForTexts).not.toHaveBeenCalled();
    expect(getLlmCredentials).not.toHaveBeenCalled();
  });

  it("fails when the run's model is not a known configuration", async () => {
    const res = await measureToolCallFootprints(auth, {
      modelId: "not-a-real-model",
      actions: [makeAction()],
    });

    expect(res.isErr()).toBe(true);
    expect(tokenCountForTexts).not.toHaveBeenCalled();
  });

  it("measures the call and result footprint of each action, aligned by position", async () => {
    const actions = [
      makeAction({ functionCallName: "a", params: {} }),
      makeAction({
        functionCallName: "b",
        params: {},
        status: "succeeded",
        output: [{ type: "text", text: "result-of-b" }],
      }),
    ];

    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      actions,
    });

    // Calls and results are tokenized as two homogeneous lists, each in input order.
    const [callTexts] = vi.mocked(tokenCountForTexts).mock.calls[0];
    const [resultTexts] = vi.mocked(tokenCountForTexts).mock.calls[1];
    expect(callTexts).toEqual(["a\n{}", "b\n{}"]);
    expect(resultTexts).toEqual([
      "Successfully executed action, no output.",
      "result-of-b",
    ]);

    expect(res.isOk() && res.value).toEqual([
      {
        callOutputTokensCount: "a\n{}".length,
        resultInputTokensCount: "Successfully executed action, no output."
          .length,
      },
      {
        callOutputTokensCount: "b\n{}".length,
        resultInputTokensCount: "result-of-b".length,
      },
    ]);
  });

  it("propagates a tokenizer failure", async () => {
    vi.mocked(tokenCountForTexts).mockResolvedValue(
      new Err(new Error("core down"))
    );

    const res = await measureToolCallFootprints(auth, {
      modelId: GPT_5_MODEL_ID,
      actions: [makeAction()],
    });

    expect(res.isErr() && res.error.message).toBe("core down");
  });
});
