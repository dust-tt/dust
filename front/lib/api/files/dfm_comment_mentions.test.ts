import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { RUNNING_AGENT_SWITCH_BLOCK_MESSAGE } from "@app/lib/api/assistant/errors";
import {
  DocumentConversationBusyError,
  dispatchCommentMentions,
  postCommentMention,
} from "@app/lib/api/files/dfm_comment_mentions";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import { Authenticator } from "@app/lib/auth";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchDocumentCommentMentionWorkflow } from "@app/temporal/mentions_queue/client";
import { makeDocumentCommentMentionWorkflowId } from "@app/temporal/mentions_queue/helpers";
import { mockUserMessage } from "@app/tests/utils/conversation_test_factories";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The message pipeline (agents, notifications) has its own tests; here only what is posted matters.
vi.mock(
  import("@app/lib/api/assistant/conversation"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    postUserMessage: vi.fn(),
  })
);

vi.mock(
  import("@app/lib/notifications/triggers/project-new-conversation"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    notifyNewProjectConversation: vi.fn(),
  })
);

vi.mock(
  import("@app/temporal/mentions_queue/client"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    launchDocumentCommentMentionWorkflow: vi.fn(),
  })
);

const AT = "2026-10-05T12:00:00.000Z";

const comment = (
  body: string,
  quote: string | null = "Ship on Thursday."
): NewCommentMessage => ({
  commentId: "c1",
  quote,
  message: {
    author: { kind: "user", id: "usr_tom", name: "Tom" },
    createdAt: AT,
    body,
  },
});

const MENTIONING = comment(
  `Can :mention[dust]{sId=${GLOBAL_AGENTS_SID.DUST}} check this with :mention_user[Yuka]{sId=usr_yuka}?`
);

const POSTED = new Ok({
  userMessage: mockUserMessage("Posted."),
  agentMessages: [],
});

describe("postCommentMention", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  const posted = vi.mocked(postUserMessage);
  const notified = vi.mocked(notifyNewProjectConversation);

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    posted.mockReset();
    posted.mockResolvedValue(POSTED);
    notified.mockReset();
  });

  const podMemberAuth = async () => {
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      auth.getNonNullableUser().sId,
      workspace.sId
    );
    return { pod, memberAuth };
  };

  it("posts a mentioning comment to the file's conversation", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });
    const documentPath = `conversation-${conversation.sId}/plan.md`;

    const result = await postCommentMention(auth, {
      documentPath,
      newMessage: comment(MENTIONING.message.body, "Ship  on\nThursday."),
    });

    expect(result.isOk()).toBe(true);
    expect(posted).toHaveBeenCalledTimes(1);
    const [, { conversationResource, content, mentions }] =
      posted.mock.calls[0];
    expect(conversationResource.sId).toBe(conversation.sId);
    expect(mentions).toEqual([
      { configurationId: GLOBAL_AGENTS_SID.DUST },
      { type: "user", userId: "usr_yuka" },
    ]);
    expect(content).toBe(
      `Comment on \`${documentPath}\`:\n\n> Ship on Thursday.\n\n${MENTIONING.message.body}`
    );
  });

  it("creates one conversation per pod document, reuses it and notifies the pod once", async () => {
    const { pod, memberAuth } = await podMemberAuth();
    const documentPath = `pod-${pod.sId}/notes.md`;

    await postCommentMention(memberAuth, {
      documentPath,
      newMessage: MENTIONING,
    });
    await postCommentMention(memberAuth, {
      documentPath,
      newMessage: MENTIONING,
    });

    const linked = await ConversationResource.fetchLatestForDocument(
      memberAuth,
      { space: pod, documentPath }
    );
    expect(linked).not.toBeNull();
    expect(linked?.spaceId).toBe(pod.id);
    expect(posted).toHaveBeenCalledTimes(2);
    for (const [, { conversationResource }] of posted.mock.calls) {
      expect(conversationResource.sId).toBe(linked?.sId);
    }
    expect(notified).toHaveBeenCalledTimes(1);
    expect(notified.mock.calls[0][1].conversation.sId).toBe(linked?.sId);
  });

  it("does not notify the pod of a new conversation nothing was posted in", async () => {
    const { pod, memberAuth } = await podMemberAuth();
    posted.mockResolvedValue(
      new Err({
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: "Nope." },
      })
    );

    const result = await postCommentMention(memberAuth, {
      documentPath: `pod-${pod.sId}/notes.md`,
      newMessage: MENTIONING,
    });

    expect(result.isOk()).toBe(true);
    expect(posted).toHaveBeenCalledTimes(1);
    expect(notified).not.toHaveBeenCalled();
  });

  it("runs only the first agent mentioned and each mention once", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });
    const dust = `:mention[dust]{sId=${GLOBAL_AGENTS_SID.DUST}}`;
    const claude = `:mention[claude]{sId=${GLOBAL_AGENTS_SID.CLAUDE_5_SONNET}}`;
    const yuka = ":mention_user[Yuka]{sId=usr_yuka}";

    await postCommentMention(auth, {
      documentPath: `conversation-${conversation.sId}/plan.md`,
      newMessage: comment(`${dust} ${yuka} ${claude} ${dust} ${yuka}`),
    });

    expect(posted.mock.calls[0][1].mentions).toEqual([
      { configurationId: GLOBAL_AGENTS_SID.DUST },
      { type: "user", userId: "usr_yuka" },
    ]);
  });

  it("waits while an agent runs in the conversation", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });
    vi.spyOn(
      ConversationResource.prototype,
      "getInFlightMessages"
    ).mockResolvedValueOnce({
      runningAgentMessage: {
        sId: "msg_running",
        agentMessageId: 1,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        rank: 1,
      },
      runningCompactionMessage: null,
    });

    const result = await postCommentMention(auth, {
      documentPath: `conversation-${conversation.sId}/plan.md`,
      newMessage: MENTIONING,
    });

    expect(result.isErr() && result.error).toBeInstanceOf(
      DocumentConversationBusyError
    );
    expect(posted).not.toHaveBeenCalled();
  });

  it.each([
    [400 as const, RUNNING_AGENT_SWITCH_BLOCK_MESSAGE],
    [
      409 as const,
      "User messages cannot be posted while conversation is being compacted.",
    ],
  ])(
    "waits when the conversation becomes busy before the post (%i)",
    async (status_code, message) => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [],
      });
      posted.mockResolvedValue(
        new Err({
          status_code,
          api_error: { type: "invalid_request_error", message },
        })
      );

      const result = await postCommentMention(auth, {
        documentPath: `conversation-${conversation.sId}/plan.md`,
        newMessage: MENTIONING,
      });

      expect(result.isErr() && result.error).toBeInstanceOf(
        DocumentConversationBusyError
      );
    }
  );

  it("drops, without retrying, a comment whose post fails", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });
    posted.mockResolvedValue(
      new Err({
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: "Nope." },
      })
    );

    const result = await postCommentMention(auth, {
      documentPath: `conversation-${conversation.sId}/plan.md`,
      newMessage: MENTIONING,
    });

    expect(result.isOk()).toBe(true);
    expect(posted).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchCommentMentions", () => {
  let auth: Authenticator;
  const launched = vi.mocked(launchDocumentCommentMentionWorkflow);

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    launched.mockReset();
    launched.mockResolvedValue(new Ok(undefined));
  });

  it("hands each mentioning message to a job keyed by the normalized document path", async () => {
    await dispatchCommentMentions(auth, {
      scopedPath: "pod-abc//notes.md",
      newMessages: [MENTIONING, comment("Looks good.")],
    });

    expect(launched).toHaveBeenCalledTimes(1);
    expect(launched.mock.calls[0][0]).toMatchObject({
      documentPath: "pod-abc/notes.md",
      newMessage: MENTIONING,
    });
  });

  it("hands nothing over for comments without mentions", async () => {
    await dispatchCommentMentions(auth, {
      scopedPath: "pod-abc/notes.md",
      newMessages: [comment("Looks good.")],
    });

    expect(launched).not.toHaveBeenCalled();
  });

  it("does not throw when handing over fails", async () => {
    launched.mockResolvedValue(new Err(new Error("Temporal is down.")));

    await expect(
      dispatchCommentMentions(auth, {
        scopedPath: "pod-abc/notes.md",
        newMessages: [MENTIONING],
      })
    ).resolves.toBeUndefined();
  });
});

describe("makeDocumentCommentMentionWorkflowId", () => {
  const id = (documentPath: string, newMessage: NewCommentMessage) =>
    makeDocumentCommentMentionWorkflowId({
      workspaceId: "w1",
      documentPath,
      newMessage,
    });

  it("is the same for the same message, so it is posted once", () => {
    expect(id("pod-abc/notes.md", MENTIONING)).toBe(
      id("pod-abc/notes.md", { ...MENTIONING, quote: "Another quote." })
    );
  });

  it("differs per document and per message", () => {
    const base = id("pod-abc/notes.md", MENTIONING);
    expect(id("pod-abc/other.md", MENTIONING)).not.toBe(base);
    expect(id("pod-abc/notes.md", comment("Edited."))).not.toBe(base);
  });
});
