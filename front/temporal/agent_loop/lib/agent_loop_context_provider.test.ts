import type { ConversationWindowStateSnapshot } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import { CheckpointedConversationWindowState } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import {
  computeConversationWindowProfileHash,
  makeConversationWindowCheckpoint,
  publishConversationWindowCheckpoint,
} from "@app/lib/api/assistant/conversation_rendering/conversation_window_checkpoint";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { prepareAgentLoopContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/checkpointed";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { GPT_4O_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({
    distribution: vi.fn(),
    increment: vi.fn(),
  }),
}));

function emptyState(): ConversationWindowStateSnapshot {
  return {
    version: 1,
    interactions: [],
    retainedTokens: 0,
    totalTokensBefore: 0,
    prunedTokens: 0,
  };
}

async function publishCheckpoint(
  checkpoint: ReturnType<typeof makeConversationWindowCheckpoint>
): Promise<void> {
  const result = await publishConversationWindowCheckpoint(checkpoint);
  if (result.isErr()) {
    throw result.error;
  }
}

function renderingInput() {
  return {
    model: GPT_4O_MODEL_CONFIG,
    prompt: "PROMPT",
    tools: "TOOLS",
    allowedTokenCount: 100_000,
    enabledSkills: [],
  };
}

function profileHash() {
  return computeConversationWindowProfileHash({
    ...renderingInput(),
    leadingMessages: [],
  });
}

function checkpointState(label: string): ConversationWindowStateSnapshot {
  const state = CheckpointedConversationWindowState.empty({
    pruningBudget: 100_000,
    budgetForInteractions: 100_000,
    logDetails: {},
  });
  state.append({
    messages: [
      {
        role: "user",
        name: "user",
        content: [{ type: "text", text: label }],
        tokenCount: 10,
      },
    ],
  });
  return state.snapshot();
}

async function createAgentLoopFixture() {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { messageRow: userMessageRow, userMessage } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
    parentMessageModelId: userMessageRow.id,
    rank: 1,
  });

  return {
    auth,
    agentMessage,
    args: {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    },
  };
}

describe("prepareAgentLoopContextProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
    fileStorageMock.setFetchFileContentNotFound(() => true);
    vi.mocked(getLlmCredentials).mockResolvedValue({});
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => 10))
    );
  });

  it("hydrates only the selected step's action outputs", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
      });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );

    for (const step of [0, 1]) {
      await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        status: "succeeded",
        step,
        output: [{ type: "text", text: `step ${step} output` }],
      });
    }

    const args = {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    };

    const full = await prepareAgentLoopContextProvider(auth, args, {
      step: 2,
      featureFlags: [],
      isActivityRetry: false,
    });
    if (full.isErr()) {
      throw full.error;
    }
    expect("content" in full.value.runtimeData.conversation).toBe(false);

    await publishCheckpoint(
      makeConversationWindowCheckpoint({
        identity: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
          agentMessageId: agentMessage.sId,
          agentMessageVersion: agentMessage.version,
          step: 1,
        },
        profileHash: "profile",
        promptTokens: 0,
        toolDefinitionTokens: 0,
        state: emptyState(),
      })
    );
    const previousCheckpoint = await prepareAgentLoopContextProvider(
      auth,
      args,
      {
        step: 2,
        featureFlags: ["stateful_conversation_window"],
        isActivityRetry: false,
      }
    );
    if (previousCheckpoint.isErr()) {
      throw previousCheckpoint.error;
    }
    expect(
      previousCheckpoint.value.runtimeData.agentMessage.actions
    ).toHaveLength(2);
    expect(
      previousCheckpoint.value.runtimeData.agentMessage.actions.find(
        (action) => action.step === 0
      )?.output
    ).toEqual([]);
    expect(
      previousCheckpoint.value.runtimeData.agentMessage.actions.find(
        (action) => action.step === 1
      )?.output
    ).toEqual([{ type: "text", text: "step 1 output" }]);

    const exactCheckpoint = await prepareAgentLoopContextProvider(auth, args, {
      step: 1,
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: true,
    });
    if (exactCheckpoint.isErr()) {
      throw exactCheckpoint.error;
    }
    expect(exactCheckpoint.value.runtimeData.agentMessage.actions).toHaveLength(
      1
    );
    expect(
      exactCheckpoint.value.runtimeData.agentMessage.actions.map(
        (action) => action.output
      )
    ).toEqual([[{ type: "text", text: "step 0 output" }]]);
    expect("content" in exactCheckpoint.value.runtimeData.conversation).toBe(
      false
    );
  });

  it("resolves an auto stream while keeping the bounded content shape", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      model: { providerId: AUTO_MODEL_ID, modelId: AUTO_MODEL_ID },
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
      });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );
    await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 0,
      type: "text_content",
      value: { type: "text_content", value: "step zero" },
    });
    await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 1,
      index: 0,
      type: "text_content",
      value: { type: "text_content", value: "step one" },
    });
    await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 1,
      type: "reasoning",
      value: {
        type: "reasoning",
        value: {
          reasoning: "old reasoning",
          metadata: "",
          tokens: 1,
          provider: "openai",
        },
      },
    });

    const args = {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    };
    await publishCheckpoint(
      makeConversationWindowCheckpoint({
        identity: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
          agentMessageId: agentMessage.sId,
          agentMessageVersion: agentMessage.version,
          step: 1,
        },
        profileHash: "profile",
        promptTokens: 0,
        toolDefinitionTokens: 0,
        state: emptyState(),
      })
    );
    const previousCheckpoint = await prepareAgentLoopContextProvider(
      auth,
      args,
      {
        step: 2,
        featureFlags: ["stateful_conversation_window"],
        isActivityRetry: false,
      }
    );
    if (previousCheckpoint.isErr()) {
      throw previousCheckpoint.error;
    }
    expect(
      previousCheckpoint.value.runtimeData.modelInfo.endpoint.modelConfig
        .modelId
    ).not.toBe(AUTO_MODEL_ID);
    expect(
      previousCheckpoint.value.runtimeData.agentMessage.contents.map(
        (content) => content.step
      )
    ).toEqual([0, 1]);
    expect(
      previousCheckpoint.value.runtimeData.agentMessage.contents.map(
        ({ content }) => content.type
      )
    ).toEqual(["text_content", "text_content"]);

    const exactCheckpoint = await prepareAgentLoopContextProvider(auth, args, {
      step: 1,
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: true,
    });
    if (exactCheckpoint.isErr()) {
      throw exactCheckpoint.error;
    }
    expect(
      exactCheckpoint.value.runtimeData.agentMessage.contents.map(
        ({ content }) => content.type
      )
    ).toEqual(["text_content", "reasoning"]);
  });

  it("adopts the canonical checkpoint after a publication race", async () => {
    const { auth, agentMessage, args } = await createAgentLoopFixture();
    const sourceIdentity = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: args.conversationId,
      agentMessageId: args.agentMessageId,
      agentMessageVersion: args.agentMessageVersion,
      step: 0,
    };
    const targetIdentity = { ...sourceIdentity, step: 1 };
    const sourceCheckpoint = makeConversationWindowCheckpoint({
      identity: sourceIdentity,
      profileHash: profileHash(),
      promptTokens: 1,
      toolDefinitionTokens: 2,
      state: checkpointState("source"),
    });
    const winner = makeConversationWindowCheckpoint({
      identity: targetIdentity,
      profileHash: profileHash(),
      promptTokens: 1,
      toolDefinitionTokens: 2,
      missingActionCatcherFunctionCallIds: ["winner_call"],
      state: checkpointState("winner"),
    });
    await AgentStepContentResource.createNewVersion({
      workspaceId: auth.getNonNullableWorkspace().id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 0,
      type: "text_content",
      value: { type: "text_content", value: "local" },
    });
    await publishCheckpoint(sourceCheckpoint);
    await publishCheckpoint(winner);

    const provider = await prepareAgentLoopContextProvider(auth, args, {
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: false,
      step: targetIdentity.step,
    });
    if (provider.isErr()) {
      throw provider.error;
    }
    const result = await provider.value.render(renderingInput());
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.modelConversation.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: "winner" }],
      }),
    ]);
    expect(result.value.missingActionCatcherFunctionCallIds).toEqual([
      "winner_call",
    ]);
  });

  it("uses an exact checkpoint without publishing it again", async () => {
    const { auth, args } = await createAgentLoopFixture();
    const identity = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: args.conversationId,
      agentMessageId: args.agentMessageId,
      agentMessageVersion: args.agentMessageVersion,
      step: 0,
    };
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: profileHash(),
      promptTokens: 1,
      toolDefinitionTokens: 2,
      state: checkpointState("exact"),
    });
    await publishCheckpoint(checkpoint);

    const provider = await prepareAgentLoopContextProvider(auth, args, {
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: true,
      step: identity.step,
    });
    if (provider.isErr()) {
      throw provider.error;
    }
    const result = await provider.value.render(renderingInput());
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.modelConversation.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: "exact" }],
      }),
    ]);
  });

  it("rebuilds from the full conversation when the profile changes", async () => {
    const { auth, args } = await createAgentLoopFixture();
    const identity = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: args.conversationId,
      agentMessageId: args.agentMessageId,
      agentMessageVersion: args.agentMessageVersion,
      step: 0,
    };
    const checkpoint = makeConversationWindowCheckpoint({
      identity,
      profileHash: "different-profile",
      promptTokens: 1,
      toolDefinitionTokens: 2,
      state: checkpointState("stale"),
    });
    await publishCheckpoint(checkpoint);

    const provider = await prepareAgentLoopContextProvider(auth, args, {
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: true,
      step: identity.step,
    });
    if (provider.isErr()) {
      throw provider.error;
    }
    const result = await provider.value.render(renderingInput());
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.modelConversation.messages).toContainEqual(
      expect.objectContaining({
        role: "user",
        content: [
          expect.objectContaining({ text: expect.stringContaining("Hello") }),
        ],
      })
    );
  });

  it("keeps the locally rendered context when checkpoint publication fails", async () => {
    const { auth, args } = await createAgentLoopFixture();
    const storage = getPrivateUploadBucket();
    vi.mocked(storage.uploadSmallRawContentToBucketAsNewFile).mockRejectedValue(
      new Error("GCS unavailable")
    );
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);

    const provider = await prepareAgentLoopContextProvider(auth, args, {
      featureFlags: ["stateful_conversation_window"],
      isActivityRetry: false,
      step: 0,
    });
    if (provider.isErr()) {
      throw provider.error;
    }
    const result = await provider.value.render(renderingInput());
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.modelConversation.messages).toContainEqual(
      expect.objectContaining({
        role: "user",
        content: [
          expect.objectContaining({ text: expect.stringContaining("Hello") }),
        ],
      })
    );
  });
});
