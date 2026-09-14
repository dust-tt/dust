import { gunzipSync, gzipSync } from "node:zlib";
import type { ConversationWindowStateSnapshot } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import {
  computeConversationWindowProfileHash,
  deleteConversationWindowCheckpoints,
  loadConversationWindowCheckpoint,
  makeConversationWindowCheckpoint,
  publishConversationWindowCheckpoint,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  GPT_5_1_MODEL_CONFIG,
  GPT_5_2_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = {
  workspaceId: "w1",
  conversationId: "c1",
  agentMessageId: "a1",
  agentMessageVersion: 0,
  step: 2,
};

function emptyState(): ConversationWindowStateSnapshot {
  return {
    version: 1,
    interactions: [],
    retainedTokens: 0,
    totalTokensBefore: 0,
    prunedTokens: 0,
  };
}

async function publishOrThrow(
  checkpoint: ReturnType<typeof makeConversationWindowCheckpoint>
) {
  const result = await publishConversationWindowCheckpoint(checkpoint);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

describe("conversation window checkpoints", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("returns no checkpoint when the object does not exist", async () => {
    fileStorageMock.setFetchFileContentNotFound(() => true);
    const loaded = await loadConversationWindowCheckpoint(identity);

    expect(loaded.isOk()).toBe(true);
    if (loaded.isErr()) {
      throw loaded.error;
    }
    expect(loaded.value).toBeNull();
  });

  it("deletes every checkpoint for a conversation", async () => {
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) => {
      deletedPrefixes.push(prefix);
    });

    await deleteConversationWindowCheckpoints(identity);

    expect(deletedPrefixes).toEqual([
      "conversation-window-checkpoints/w/w1/conversations/c1/",
    ]);
  });

  it("returns storage failures as errors", async () => {
    const storage = getPrivateUploadBucket();
    vi.mocked(storage.fetchFileBuffer).mockRejectedValueOnce(
      new Error("GCS unavailable")
    );
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(storage);
    const loaded = await loadConversationWindowCheckpoint(identity);

    expect(loaded.isErr()).toBe(true);
    if (loaded.isOk()) {
      throw new Error("Expected the storage failure to be returned");
    }
    expect(loaded.error.message).toBe("GCS unavailable");
  });

  it("round-trips a compressed checkpoint", async () => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      missingActionCatcherFunctionCallIds: ["call_1"],
      state: emptyState(),
      nowMs: 1_000,
    });

    await publishOrThrow(checkpoint);
    const loaded = await loadConversationWindowCheckpoint(identity, {
      nowMs: 2_000,
    });
    if (loaded.isErr()) {
      throw loaded.error;
    }

    expect(loaded.value).toEqual(checkpoint);
    expect(loaded.value?.contextEpoch).toBe(0);
    expect(loaded.value?.missingActionCatcherFunctionCallIds).toEqual([
      "call_1",
    ]);
    const storedCheckpoint = fileStorageMock.saveFileCalls[0];
    expect(storedCheckpoint.content.toString()).not.toContain("profileHash");
    expect(storedCheckpoint.filePath).toBe(
      "conversation-window-checkpoints/w/w1/conversations/c1/agent-messages/a1/versions/0/schemas/v1/steps/2.json"
    );
  });

  it("round-trips text content with LLM provenance metadata", async () => {
    const metadata = {
      phase: "final_answer" as const,
      region: "us",
      modelId: "gpt-5.1",
      clientId: "openai",
      inferenceRegion: "global",
      inferenceProvider: "openai-responses",
    };
    const state: ConversationWindowStateSnapshot = {
      version: 1,
      interactions: [
        {
          messages: [
            {
              kind: "message",
              message: {
                role: "assistant",
                name: "assistant",
                contents: [
                  {
                    type: "text_content",
                    value: "Hello",
                    metadata,
                  },
                ],
                tokenCount: 10,
              },
            },
          ],
        },
      ],
      retainedTokens: 10,
      totalTokensBefore: 10,
      prunedTokens: 0,
    };
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state,
    });

    await publishOrThrow(checkpoint);
    const loaded = await loadConversationWindowCheckpoint(identity);
    if (loaded.isErr()) {
      throw loaded.error;
    }

    expect(loaded.value).toEqual(checkpoint);
  });

  it("ignores an expired checkpoint", async () => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
      nowMs: 1_000,
    });
    await publishOrThrow(checkpoint);

    const loaded = await loadConversationWindowCheckpoint(identity, {
      nowMs: checkpoint.validUntilMs,
    });

    expect(loaded.isOk()).toBe(true);
    if (loaded.isErr()) {
      throw loaded.error;
    }
    expect(loaded.value).toBeNull();
  });

  it("rejects an invalid compressed payload", async () => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
    });
    await publishOrThrow(checkpoint);
    const path = fileStorageMock.saveFileCalls[0].filePath;
    fileStorageMock.setObject(
      path,
      JSON.stringify({ encoding: "gzip-base64", payload: "not-gzip" })
    );

    const loaded = await loadConversationWindowCheckpoint(identity);

    expect(loaded.isErr()).toBe(true);
  });

  it("uses the earliest signed URL expiry with a safety margin", () => {
    const state = emptyState();
    state.interactions = [
      {
        messages: [
          {
            kind: "message",
            message: {
              role: "user",
              name: "user",
              content: [
                {
                  type: "text",
                  text: "Ignore https://storage.googleapis.com/bucket/not-an-image?X-Goog-Date=20260824T120000Z&X-Goog-Expires=600",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: "https://storage.googleapis.com/bucket/file?X-Goog-Date=20260824T120000Z&X-Goog-Expires=3600",
                  },
                },
              ],
              tokenCount: 3_100,
            },
          },
          {
            kind: "tool_result",
            message: {
              role: "function",
              name: "tool",
              function_call_id: "call_1",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: "https://storage.googleapis.com/bucket/earlier?X-Goog-Date=20260824T120000Z&X-Goog-Expires=2400",
                  },
                },
              ],
              tokenCount: 3_100,
            },
            tokenSavings: 0,
            pruned: false,
            phase: "pending",
          },
        ],
      },
    ];
    state.retainedTokens = 6_200;
    state.totalTokensBefore = 6_200;

    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state,
      nowMs: Date.UTC(2026, 7, 24, 12, 0, 0),
    });

    expect(checkpoint.validUntilMs).toBe(Date.UTC(2026, 7, 24, 12, 35, 0));
  });

  it("loads the create-once winner", async () => {
    const winner = makeConversationWindowCheckpoint({
      identity,
      profileHash: "winner",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
    });
    const loser = { ...winner, profileHash: "loser" };

    await publishOrThrow(winner);
    const published = await publishOrThrow(loser);

    expect(published.created).toBe(false);
    expect(published.checkpoint.profileHash).toBe("winner");
  });

  it("rejects malformed checkpointed model messages", async () => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
    });
    await publishOrThrow(checkpoint);

    const path = fileStorageMock.saveFileCalls[0].filePath;
    const raw = fileStorageMock.getObject(path);
    if (!raw) {
      throw new Error("Expected a stored checkpoint");
    }
    const envelope = JSON.parse(raw);
    const payload = JSON.parse(
      gunzipSync(Buffer.from(envelope.payload, "base64")).toString("utf8")
    );
    payload.state.interactions = [
      {
        messages: [
          {
            kind: "message",
            message: {
              role: "user",
              name: "user",
              content: [null],
              tokenCount: 1,
            },
          },
        ],
      },
    ];
    envelope.payload = gzipSync(JSON.stringify(payload)).toString("base64");
    fileStorageMock.setObject(path, JSON.stringify(envelope));

    const loaded = await loadConversationWindowCheckpoint(identity);
    expect(loaded.isErr()).toBe(true);
    if (loaded.isOk()) {
      throw new Error("Expected malformed checkpoint to fail");
    }
    expect(loaded.error.message).toContain(
      "Invalid checkpointed model message"
    );
  });

  it("rejects malformed assistant content", async () => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
    });
    await publishOrThrow(checkpoint);

    const path = fileStorageMock.saveFileCalls[0].filePath;
    const raw = fileStorageMock.getObject(path);
    if (!raw) {
      throw new Error("Expected a stored checkpoint");
    }
    const envelope = JSON.parse(raw);
    const payload = JSON.parse(
      gunzipSync(Buffer.from(envelope.payload, "base64")).toString("utf8")
    );
    payload.state = {
      version: 1,
      interactions: [
        {
          messages: [
            {
              kind: "message",
              message: {
                role: "assistant",
                name: "assistant",
                contents: [{ type: "reasoning" }],
                tokenCount: 10,
              },
            },
          ],
        },
      ],
      retainedTokens: 10,
      totalTokensBefore: 10,
      prunedTokens: 0,
    };
    envelope.payload = gzipSync(JSON.stringify(payload)).toString("base64");
    fileStorageMock.setObject(path, JSON.stringify(envelope));

    const loaded = await loadConversationWindowCheckpoint(identity);
    expect(loaded.isErr()).toBe(true);
    if (loaded.isOk()) {
      throw new Error("Expected malformed checkpoint to fail");
    }
    expect(loaded.error.message).toContain(
      "Invalid checkpointed model message"
    );
  });

  it.each([
    ["workspace", { workspaceId: "w_2" }],
    ["conversation", { conversationId: "conv_2" }],
    ["agent message", { agentMessageId: "agent_2" }],
    ["agent message version", { agentMessageVersion: 2 }],
    ["step", { step: 3 }],
  ])("uses a different object key when %s changes", async (_name, change) => {
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "profile",
      promptTokens: 20,
      toolDefinitionTokens: 30,
      state: emptyState(),
    });

    await publishOrThrow(checkpoint);
    await publishOrThrow({
      ...checkpoint,
      identity: { ...identity, ...change },
    });

    expect(fileStorageMock.saveFileCalls).toHaveLength(2);
    expect(fileStorageMock.saveFileCalls[0].filePath).not.toBe(
      fileStorageMock.saveFileCalls[1].filePath
    );
  });

  type ProfileInput = Parameters<
    typeof computeConversationWindowProfileHash
  >[0];
  const baseProfile: ProfileInput = {
    model: GPT_5_1_MODEL_CONFIG,
    prompt: "prompt",
    tools: "tools",
    allowedTokenCount: 100_000,
    leadingMessages: [],
    excludeActions: false,
    excludeImages: false,
    onMissingAction: "inject-placeholder",
    agentConfigurationId: "agent_1",
  };
  const profileMutations: Array<
    [string, (profile: ProfileInput) => ProfileInput]
  > = [
    [
      "model provider",
      (profile) => ({
        ...profile,
        model: { ...profile.model, providerId: "anthropic" },
      }),
    ],
    ["model id", (profile) => ({ ...profile, model: GPT_5_2_MODEL_CONFIG })],
    [
      "model context size",
      (profile) => ({
        ...profile,
        model: { ...profile.model, contextSize: 100_000 },
      }),
    ],
    [
      "model generation budget",
      (profile) => ({
        ...profile,
        model: { ...profile.model, generationTokensCount: 8_192 },
      }),
    ],
    [
      "model token adjustment",
      (profile) => ({
        ...profile,
        model: { ...profile.model, tokenCountAdjustment: 1.1 },
      }),
    ],
    [
      "model tokenizer",
      (profile) => ({
        ...profile,
        model: {
          ...profile.model,
          tokenizer: { type: "tiktoken", base: "cl100k_base" },
        },
      }),
    ],
    [
      "model vision support",
      (profile) => ({
        ...profile,
        model: { ...profile.model, supportsVision: false },
      }),
    ],
    ["prompt", (profile) => ({ ...profile, prompt: "changed prompt" })],
    ["tools", (profile) => ({ ...profile, tools: "changed tools" })],
    [
      "allowed token count",
      (profile) => ({ ...profile, allowedTokenCount: 90_000 }),
    ],
    [
      "leading messages",
      (profile) => ({
        ...profile,
        leadingMessages: [
          {
            role: "user",
            name: "context",
            content: [{ type: "text", text: "leading context" }],
          },
        ],
      }),
    ],
    ["action exclusion", (profile) => ({ ...profile, excludeActions: true })],
    ["image exclusion", (profile) => ({ ...profile, excludeImages: true })],
    [
      "missing-action behavior",
      (profile) => ({ ...profile, onMissingAction: "skip" }),
    ],
    [
      "agent configuration",
      (profile) => ({ ...profile, agentConfigurationId: "agent_2" }),
    ],
  ];

  it.each(
    profileMutations
  )("invalidates the profile when %s changes", (_name, mutate) => {
    expect(computeConversationWindowProfileHash(mutate(baseProfile))).not.toBe(
      computeConversationWindowProfileHash(baseProfile)
    );
  });
});
