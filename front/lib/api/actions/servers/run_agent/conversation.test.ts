import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { getOrCreateConversation } from "@app/lib/api/actions/servers/run_agent/conversation";
import type { Authenticator } from "@app/lib/auth";
import { getApiKeyNameHeader } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { decodeUtf8HeaderValue } from "@app/types/shared/utils/http_headers";
import { getHeaderFromUserEmail } from "@app/types/user";
import type { ConversationPublicType } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  describe("attribution headers", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("creates the sub-conversation when the API key name and user email contain non-Latin-1 characters", async () => {
      const { mainConversation, originMessage, mainAgent, agentLoopContext } =
        buildRunAgentFixtures({ spaceId: null });

      // Typed against the two methods getApiKeyNameHeader exercises; the cast
      // to Authenticator only widens to the class type.
      const auth = {
        attributionKey: () => ({ id: 1, name: "Clé 🔑 złoty smørrebrød" }),
        key: () => null,
      } satisfies Pick<
        Authenticator,
        "attributionKey" | "key"
      > as unknown as Authenticator;

      const cannedOwner = {
        id: 1,
        sId: generateRandomModelSId(),
        name: "workspace",
        role: "user",
        segmentation: null,
        whiteListedProviders: null,
        defaultEmbeddingProvider: null,
        regionalModelsOnly: false,
      };
      const cannedResponseBody = {
        conversation: {
          id: 1,
          created: Date.now(),
          unread: false,
          actionRequired: false,
          owner: cannedOwner,
          sId: generateRandomModelSId(),
          title: null,
          visibility: "unlisted",
          content: [],
          url: "http://front.test/conversation",
        },
        message: {
          id: 1,
          created: Date.now(),
          type: "user_message",
          sId: generateRandomModelSId(),
          visibility: "visible",
          version: 0,
          user: null,
          mentions: [],
          content: "hello",
          context: {
            username: "MainAgent",
            timezone: "UTC",
            origin: "api",
          },
        },
      };

      const capturedRequests: Request[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          // The Request constructor applies the same header validation as a real
          // fetch: unsanitized non-Latin-1 header values throw a TypeError here.
          const request = new Request(input, init);
          capturedRequests.push(request);
          return new Response(JSON.stringify(cannedResponseBody), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        })
      );

      // Built the same way the run_agent tool handler builds its DustAPI.
      const api = new DustAPI(
        { url: "http://front.test" },
        {
          apiKey: "sk-test",
          workspaceId: generateRandomModelSId(),
          extraHeaders: {
            ...getHeaderFromUserEmail("jérôme.łukasz@example.com"),
            ...getApiKeyNameHeader(auth),
          },
        },
        { error: vi.fn(), info: vi.fn(), trace: vi.fn(), warn: vi.fn() }
      );

      const result = await getOrCreateConversation(
        api,
        auth,
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
      expect(capturedRequests).toHaveLength(1);
      const headers = capturedRequests[0].headers;
      // Values with characters above 0xFF (ł, emoji) travel as an RFC 2047
      // encoded-word and round-trip losslessly through the header.
      const keyNameHeader = headers.get("x-dust-api-key-name");
      assert(keyNameHeader);
      expect(keyNameHeader).toMatch(/^=\?utf-8\?B\?/);
      expect(decodeUtf8HeaderValue(keyNameHeader)).toBe(
        "Clé 🔑 złoty smørrebrød"
      );
      const emailHeader = headers.get("x-api-user-email");
      assert(emailHeader);
      expect(decodeUtf8HeaderValue(emailHeader)).toBe(
        "jérôme.łukasz@example.com"
      );
    });
  });
});
