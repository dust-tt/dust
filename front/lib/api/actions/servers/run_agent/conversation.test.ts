import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { getOrCreateConversation } from "@app/lib/api/actions/servers/run_agent/conversation";
import * as conversationDestroy from "@app/lib/api/assistant/conversation/destroy";
import type { Authenticator } from "@app/lib/auth";
import { getApiKeyNameHeader } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import { decodeUtf8HeaderValue } from "@app/types/shared/utils/http_headers";
import { getHeaderFromUserEmail } from "@app/types/user";
import type { APIError, ConversationPublicType } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCopyConversationFilesIntoSub,
  mockCopySelectedConversationSpacesToChild,
} = vi.hoisted(() => ({
  mockCopyConversationFilesIntoSub: vi.fn(),
  mockCopySelectedConversationSpacesToChild: vi.fn(),
}));

vi.mock("@app/lib/api/actions/servers/run_agent/file_paths", async () => {
  const original = await vi.importActual<
    typeof import("@app/lib/api/actions/servers/run_agent/file_paths")
  >("@app/lib/api/actions/servers/run_agent/file_paths");
  return {
    ...original,
    copyConversationFilesIntoSub: mockCopyConversationFilesIntoSub,
  };
});

vi.mock("@app/lib/api/assistant/conversation/selected_spaces", () => ({
  copySelectedConversationSpacesToChild:
    mockCopySelectedConversationSpacesToChild,
}));

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
  createConversationImpl: DustAPI["createConversation"],
  conversation: ConversationPublicType
): DustAPI {
  return {
    createConversation: createConversationImpl,
    getConversation: vi.fn().mockResolvedValue(new Ok(conversation)),
    postUserMessage: vi.fn().mockResolvedValue(
      new Ok({
        sId: generateRandomModelSId(),
      })
    ),
  } as unknown as DustAPI;
}

function buildRequest(
  fixtures: ReturnType<typeof buildRunAgentFixtures>,
  overrides: Partial<Parameters<typeof getOrCreateConversation>[3]> = {}
): Parameters<typeof getOrCreateConversation>[3] {
  return {
    childAgentBlob: { name: "ChildAgent", description: "A child agent" },
    childAgentId: generateRandomModelSId(),
    ...fixtures,
    query: "Do something",
    toolsetsToAdd: null,
    fileOrContentFragmentIds: null,
    filePaths: null,
    conversationId: null,
    ...overrides,
  };
}

describe("getOrCreateConversation", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockCopyConversationFilesIntoSub.mockReset();
    mockCopyConversationFilesIntoSub.mockResolvedValue(new Ok(undefined));
    mockCopySelectedConversationSpacesToChild.mockReset();
    mockCopySelectedConversationSpacesToChild.mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("forwards the parent conversation spaceId when creating a sub-conversation", async () => {
    const spaceId = generateRandomModelSId();
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId });

    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: childConversation,
      })
    );
    const api = createMockApi(mockCreateConversation, childConversation);

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
    expect(mockCreateConversation.mock.calls[0][0]).not.toHaveProperty(
      "message"
    );
    expect(mockCopySelectedConversationSpacesToChild).toHaveBeenCalledWith(
      expect.anything(),
      {
        parentConversation: mainConversation,
        childConversationId: childConversation.sId,
      }
    );
    expect(api.postUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: childConversation.sId })
    );
    expect(
      mockCopySelectedConversationSpacesToChild.mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(api.postUserMessage).mock.invocationCallOrder[0]);
  });

  it("omits spaceId when the parent conversation has no space", async () => {
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId: null });

    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: childConversation,
      })
    );
    const api = createMockApi(mockCreateConversation, childConversation);

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
      expect(capturedRequests).toHaveLength(3);
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

  it("cleans up a new child conversation when selected Space inheritance fails", async () => {
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId: null });
    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const childConversationResource = ConversationResource.prototype;
    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: childConversation,
      })
    );
    const api = createMockApi(mockCreateConversation, childConversation);
    const fetchChildSpy = vi
      .spyOn(ConversationResource, "fetchById")
      .mockResolvedValue(childConversationResource);
    const destroyConversationSpy = vi
      .spyOn(conversationDestroy, "destroyConversation")
      .mockResolvedValue(new Ok(undefined));
    mockCopySelectedConversationSpacesToChild.mockResolvedValueOnce(
      new Err(new Error("copy failed"))
    );

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

    expect(result.isErr()).toBe(true);
    expect(fetchChildSpy).toHaveBeenCalledWith(
      expect.anything(),
      childConversation.sId
    );
    expect(destroyConversationSpy).toHaveBeenCalledWith(expect.anything(), {
      conversation: childConversationResource,
    });
    expect(api.postUserMessage).not.toHaveBeenCalled();

    fetchChildSpy.mockRestore();
    destroyConversationSpy.mockRestore();
  });

  it("does not clean up a child conversation after an ambiguous post failure", async () => {
    const { mainConversation, originMessage, mainAgent, agentLoopContext } =
      buildRunAgentFixtures({ spaceId: null });
    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const mockCreateConversation = vi.fn().mockResolvedValue(
      new Ok({
        conversation: childConversation,
      })
    );
    const api = createMockApi(mockCreateConversation, childConversation);
    vi.mocked(api.postUserMessage).mockResolvedValueOnce(
      new Err({
        type: "internal_server_error",
        message: "socket hang up",
      } as APIError)
    );
    const fetchChildSpy = vi.spyOn(ConversationResource, "fetchById");

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

    expect(result.isErr()).toBe(true);
    expect(fetchChildSpy).not.toHaveBeenCalled();
    fetchChildSpy.mockRestore();
  });

  it("cleans up a new child conversation after a user-side post failure", async () => {
    const fixtures = buildRunAgentFixtures({ spaceId: null });
    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const api = createMockApi(
      vi.fn().mockResolvedValue(new Ok({ conversation: childConversation })),
      childConversation
    );
    vi.mocked(api.postUserMessage).mockResolvedValueOnce(
      new Err({
        type: "invalid_request_error",
        message: "invalid message",
      } as APIError)
    );
    const fetchChildSpy = vi
      .spyOn(ConversationResource, "fetchById")
      .mockResolvedValue(ConversationResource.prototype);
    const destroyConversationSpy = vi
      .spyOn(conversationDestroy, "destroyConversation")
      .mockResolvedValue(new Err(new Error("cleanup failed")));

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      fixtures.agentLoopContext,
      buildRequest(fixtures)
    );

    assert(result.isErr());
    expect(result.error.message).toBe("invalid message");
    expect(fetchChildSpy).toHaveBeenCalledWith(
      expect.anything(),
      childConversation.sId
    );
    expect(destroyConversationSpy).toHaveBeenCalledOnce();
  });

  it("cleans up a new child conversation when file copying fails", async () => {
    const fixtures = buildRunAgentFixtures({ spaceId: null });
    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const api = createMockApi(
      vi.fn().mockResolvedValue(new Ok({ conversation: childConversation })),
      childConversation
    );
    mockCopyConversationFilesIntoSub.mockResolvedValueOnce(
      new Err(new Error("copy failed"))
    );
    const fetchChildSpy = vi
      .spyOn(ConversationResource, "fetchById")
      .mockResolvedValue(ConversationResource.prototype);
    const destroyConversationSpy = vi
      .spyOn(conversationDestroy, "destroyConversation")
      .mockResolvedValue(new Ok(undefined));

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      fixtures.agentLoopContext,
      buildRequest(fixtures)
    );

    expect(result.isErr()).toBe(true);
    expect(fetchChildSpy).toHaveBeenCalledWith(
      expect.anything(),
      childConversation.sId
    );
    expect(destroyConversationSpy).toHaveBeenCalledOnce();
    expect(api.postUserMessage).not.toHaveBeenCalled();
  });

  it("never cleans up the parent conversation after a handover post failure", async () => {
    const fixtures = buildRunAgentFixtures({ spaceId: null });
    const api = createMockApi(vi.fn(), {} as ConversationPublicType);
    vi.mocked(api.postUserMessage).mockResolvedValueOnce(
      new Err({
        type: "invalid_request_error",
        message: "invalid message",
      } as APIError)
    );
    const destroyConversationSpy = vi.spyOn(
      conversationDestroy,
      "destroyConversation"
    );
    const fetchChildSpy = vi.spyOn(ConversationResource, "fetchById");

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      fixtures.agentLoopContext,
      buildRequest(fixtures, { conversationId: fixtures.mainConversation.sId })
    );

    expect(result.isErr()).toBe(true);
    expect(fetchChildSpy).not.toHaveBeenCalled();
    expect(destroyConversationSpy).not.toHaveBeenCalled();
  });

  it("does not clean up after posting succeeds but fetching the child fails", async () => {
    const fixtures = buildRunAgentFixtures({ spaceId: null });
    const childConversation = {
      sId: generateRandomModelSId(),
    } as ConversationPublicType;
    const api = createMockApi(
      vi.fn().mockResolvedValue(new Ok({ conversation: childConversation })),
      childConversation
    );
    vi.mocked(api.getConversation).mockResolvedValueOnce(
      new Err({
        type: "internal_server_error",
        message: "fetch failed",
      } as APIError)
    );
    const fetchChildSpy = vi.spyOn(ConversationResource, "fetchById");

    const result = await getOrCreateConversation(
      api,
      {} as Authenticator,
      fixtures.agentLoopContext,
      buildRequest(fixtures)
    );

    expect(result.isErr()).toBe(true);
    expect(api.postUserMessage).toHaveBeenCalledOnce();
    expect(fetchChildSpy).not.toHaveBeenCalled();
  });
});
