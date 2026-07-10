import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { getOrCreateConversation } from "@app/lib/api/actions/servers/run_agent/conversation";
import type { Authenticator } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import type { ConversationPublicType, DustAPI } from "@dust-tt/client";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

function buildRunAgentFixtures({ spaceId }: { spaceId: string | null }): {
  mainConversation: ConversationType;
  originMessage: AgentMessageType;
  mainAgent: AgentConfigurationType;
  agentLoopContext: AgentLoopRunContext;
} {
  const userMessage: UserMessageType = {
    id: -1,
    created: Date.now(),
    type: "user_message",
    sId: generateRandomModelSId(),
    visibility: "visible",
    version: 0,
    rank: 0,
    branchId: null,
    user: null,
    mentions: [],
    richMentions: [],
    content: "hello",
    context: {
      username: "user",
      fullName: null,
      email: null,
      profilePictureUrl: null,
      timezone: "UTC",
      origin: "web",
    },
    reactions: [],
    requestedModel: null,
  };

  const originMessage = {
    id: -1,
    agentMessageId: -1,
    created: Date.now(),
    completedTs: null,
    sId: generateRandomModelSId(),
    type: "agent_message",
    visibility: "visible",
    version: 0,
    parentMessageId: userMessage.sId,
    parentAgentMessageId: null,
    status: "created",
    content: null,
    chainOfThought: null,
    error: null,
    configuration: {
      sId: generateRandomModelSId(),
      name: "MainAgent",
      pictureUrl: "",
      status: "active",
      canRead: true,
    },
    skipToolsValidation: false,
    actions: [],
    contents: [],
    reactions: [],
    modelInteractionDurationMs: null,
    completionDurationMs: null,
    rank: 1,
    branchId: null,
    richMentions: [],
    costCredits: null,
    requestedModel: null,
  } as unknown as AgentMessageType;

  const mainAgent = {
    name: "MainAgent",
    pictureUrl: "https://example.com/pic.png",
    sId: originMessage.configuration.sId,
  } as AgentConfigurationType;

  const agentLoopContext = {
    agentMessage: originMessage,
    stepContext: {
      resumeState: null,
    },
  } as AgentLoopRunContext;

  const mainConversation = {
    sId: generateRandomModelSId(),
    depth: 0,
    spaceId,
    content: [[userMessage]],
  } as ConversationType;

  return {
    mainConversation,
    originMessage,
    mainAgent,
    agentLoopContext,
  };
}

function createMockApi(
  createConversationImpl: DustAPI["createConversation"]
): DustAPI {
  return {
    createConversation: createConversationImpl,
    getConversation: vi.fn(),
    postUserMessage: vi.fn(),
  } as unknown as DustAPI;
}

describe("getOrCreateConversation", () => {
  it("forwards the parent conversation spaceId when creating a sub-conversation", async () => {
    const spaceId = generateRandomModelSId();
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId });

    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: {
          sId: generateRandomModelSId(),
        } as ConversationPublicType,
        message: { sId: generateRandomModelSId() },
      })
    );
    const api = createMockApi(mockCreateConversation);

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      agentLoopContext,
      {
        childAgentBlob: { name: "ChildAgent", description: "A child agent" },
        childAgentId: generateRandomModelSId(),
        mainAgent,
        originMessage,
        mainConversation,
        query: "Do something",
        toolsetsToAdd: null,
        fileOrContentFragmentIds: null,
        filePaths: null,
        conversationId: null,
      }
    );

    assert(result.isOk());
    expect(mockCreateConversation).toHaveBeenCalledOnce();
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId,
        depth: mainConversation.depth + 1,
      })
    );
  });

  it("omits spaceId when the parent conversation has no space", async () => {
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId: null });

    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: {
          sId: generateRandomModelSId(),
        } as ConversationPublicType,
        message: { sId: generateRandomModelSId() },
      })
    );
    const api = createMockApi(mockCreateConversation);

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      agentLoopContext,
      {
        childAgentBlob: { name: "ChildAgent", description: "A child agent" },
        childAgentId: generateRandomModelSId(),
        mainAgent,
        originMessage,
        mainConversation,
        query: "Do something",
        toolsetsToAdd: null,
        fileOrContentFragmentIds: null,
        filePaths: null,
        conversationId: null,
      }
    );

    assert(result.isOk());
    expect(mockCreateConversation).toHaveBeenCalledOnce();
    expect(mockCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: undefined,
      })
    );
  });
});
