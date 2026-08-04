import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/pubsub", () => ({
  gracefullyStopAgentLoop: vi.fn(),
}));

import {
  editUserMessage,
  postUserMessage,
  retryAgentMessage,
  updateAgentMessageWithFinalStatus,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import type { AgentMention } from "@app/types/assistant/mentions";

/**
 * The canonical execution authority for a run's context mode is the `AgentMessageModel` row,
 * snapshotted in the same transaction that creates it. These tests read that row directly so they
 * assert on what the agent loop will actually resolve, not on the request or a rendered shape.
 */
async function readAgentMessageRow(
  auth: Authenticator,
  agentMessage: AgentMessageType
): Promise<AgentMessageModel> {
  const row = await AgentMessageModel.findOne({
    where: {
      id: agentMessage.agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });
  if (!row) {
    throw new Error(`Agent message row ${agentMessage.agentMessageId} missing`);
  }
  return row;
}

describe("conversation context isolation", () => {
  let auth: Authenticator;
  let agentConfig: LightAgentConfigurationType;
  let conversationResource: ConversationResource;
  let context: UserMessageContext;

  async function post({
    content,
    conversationContextMode,
  }: {
    content: string;
    conversationContextMode?: ConversationContextMode;
  }) {
    const res = await postUserMessage(auth, {
      conversationResource,
      content,
      mentions: [{ configurationId: agentConfig.sId } satisfies AgentMention],
      context,
      skipToolsValidation: false,
      conversationContextMode,
    });
    if (res.isErr()) {
      throw new Error(`postUserMessage failed: ${res.error.api_error.message}`);
    }
    return res.value;
  }

  // A conversation only accepts a new agent run once the previous one has finished; otherwise the
  // post is queued as a pending steering message and creates no agent message.
  async function postAndComplete(args: {
    content: string;
    conversationContextMode?: ConversationContextMode;
  }) {
    const result = await post(args);
    for (const agentMessage of result.agentMessages) {
      await updateAgentMessageWithFinalStatus(auth, {
        conversation: conversationResource.toJSON(),
        agentMessage,
        status: "succeeded",
      });
    }
    return result;
  }

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Isolation Test Agent",
      description: "Agent used by the context isolation tests",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const fetched = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!fetched) {
      throw new Error("Failed to fetch conversation resource");
    }
    conversationResource = fetched;

    const user = auth.getNonNullableUser().toJSON();
    context = {
      username: user.username,
      timezone: "UTC",
      fullName: user.fullName,
      email: user.email,
      profilePictureUrl: user.image,
      origin: "web",
    };

    vi.clearAllMocks();
  });

  it("defaults to full when the caller omits the mode", async () => {
    const { userMessage, agentMessages } = await post({ content: "Hello" });

    expect(userMessage.conversationContextMode).toEqual("full");
    expect(agentMessages).toHaveLength(1);

    const row = await readAgentMessageRow(auth, agentMessages[0]);
    expect(row.conversationContextMode).toEqual("full");
    expect(row.contextIsolationRootRank).toBeNull();
  });

  it("snapshots isolated mode and the isolation root on the agent message", async () => {
    await postAndComplete({ content: "First" });
    const { userMessage, agentMessages } = await post({
      content: "Second",
      conversationContextMode: "isolated",
    });

    expect(userMessage.conversationContextMode).toEqual("isolated");

    const row = await readAgentMessageRow(auth, agentMessages[0]);
    expect(row.conversationContextMode).toEqual("isolated");
    // The isolation root is the marked message itself.
    expect(row.contextIsolationRootRank).toEqual(userMessage.rank);
  });

  it("gives the next ordinary message full mode again", async () => {
    await postAndComplete({ content: "First" });
    await postAndComplete({
      content: "Second",
      conversationContextMode: "isolated",
    });

    const { userMessage, agentMessages } = await post({ content: "Third" });

    expect(userMessage.conversationContextMode).toEqual("full");
    const row = await readAgentMessageRow(auth, agentMessages[0]);
    expect(row.conversationContextMode).toEqual("full");
    expect(row.contextIsolationRootRank).toBeNull();
  });

  it("preserves the mode when a response is retried", async () => {
    await postAndComplete({ content: "First" });
    const { agentMessages } = await post({
      content: "Second",
      conversationContextMode: "isolated",
    });

    const conversationRes = await getConversation(
      auth,
      conversationResource.sId
    );
    if (conversationRes.isErr()) {
      throw conversationRes.error;
    }

    const retryRes = await retryAgentMessage(auth, {
      conversationResource,
      message: agentMessages[0],
    });
    expect(retryRes.isOk()).toBe(true);
    if (retryRes.isErr()) {
      throw retryRes.error;
    }

    const original = await readAgentMessageRow(auth, agentMessages[0]);
    const retried = await readAgentMessageRow(auth, retryRes.value);

    expect(retried.conversationContextMode).toEqual("isolated");
    expect(retried.contextIsolationRootRank).toEqual(
      original.contextIsolationRootRank
    );
  });

  it("preserves the mode when the marked message is edited without an override", async () => {
    await postAndComplete({ content: "First" });

    // Posted without an agent mention so no reply exists yet: the edit is then the post that
    // creates the agent message, which is where the snapshot has to be preserved.
    const postRes = await postUserMessage(auth, {
      conversationResource,
      content: "Second",
      mentions: [],
      context,
      skipToolsValidation: false,
      skipDustAutoMention: true,
      conversationContextMode: "isolated",
    });
    if (postRes.isErr()) {
      throw new Error(postRes.error.api_error.message);
    }
    const { userMessage } = postRes.value;
    expect(postRes.value.agentMessages).toHaveLength(0);

    const editRes = await editUserMessage(auth, {
      conversationResource,
      message: userMessage as UserMessageType,
      content: "Second, edited",
      mentions: [{ configurationId: agentConfig.sId } satisfies AgentMention],
      skipToolsValidation: false,
    });
    expect(editRes.isOk()).toBe(true);
    if (editRes.isErr()) {
      throw new Error(editRes.error.api_error.message);
    }

    expect(editRes.value.userMessage.conversationContextMode).toEqual(
      "isolated"
    );
    expect(editRes.value.userMessage.version).toEqual(userMessage.version + 1);
    expect(editRes.value.agentMessages).toHaveLength(1);

    const row = await readAgentMessageRow(auth, editRes.value.agentMessages[0]);
    expect(row.conversationContextMode).toEqual("isolated");
    // Ranks are stable across versions, so the boundary does not move.
    expect(row.contextIsolationRootRank).toEqual(userMessage.rank);
  });

  it("does not let an isolated run change the mode of a concurrent full run", async () => {
    const first = await postAndComplete({ content: "First" });
    const second = await postAndComplete({
      content: "Second",
      conversationContextMode: "isolated",
    });

    const firstRow = await readAgentMessageRow(auth, first.agentMessages[0]);
    const secondRow = await readAgentMessageRow(auth, second.agentMessages[0]);

    expect(firstRow.conversationContextMode).toEqual("full");
    expect(firstRow.contextIsolationRootRank).toBeNull();
    expect(secondRow.conversationContextMode).toEqual("isolated");
    expect(secondRow.contextIsolationRootRank).toEqual(second.userMessage.rank);
  });

  it("keeps the marked message and its answer visible in the transcript", async () => {
    await postAndComplete({ content: "First" });
    const { userMessage, agentMessages } = await post({
      content: "Second",
      conversationContextMode: "isolated",
    });

    const conversationRes = await getConversation(
      auth,
      conversationResource.sId
    );
    if (conversationRes.isErr()) {
      throw conversationRes.error;
    }

    const flat = conversationRes.value.content.flat();
    const marked = flat.find((m) => m.sId === userMessage.sId);
    const answer = flat.find((m) => m.sId === agentMessages[0].sId);

    expect(marked).toBeDefined();
    expect(marked?.visibility).toEqual("visible");
    expect(answer).toBeDefined();
    expect(answer?.visibility).toEqual("visible");

    // The transcript marker is read off the user message.
    expect(
      marked && isUserMessageType(marked)
        ? marked.conversationContextMode
        : null
    ).toEqual("isolated");
  });
});
