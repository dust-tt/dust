import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { dispatchCommentMentions } from "@app/lib/api/files/dfm_comment_mentions";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Err } from "@app/types/shared/result";
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

describe("dispatchCommentMentions", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  const posted = vi.mocked(postUserMessage);

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    posted.mockReset();
    posted.mockResolvedValue(
      new Err({
        status_code: 500,
        api_error: { type: "internal_server_error", message: "Not posted." },
      })
    );
  });

  it("posts a mentioning comment to the file's conversation", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });
    const scopedPath = `conversation-${conversation.sId}/plan.md`;

    await dispatchCommentMentions(auth, {
      scopedPath,
      newMessages: [MENTIONING],
    });

    expect(posted).toHaveBeenCalledTimes(1);
    const [, { conversationResource, content, mentions }] =
      posted.mock.calls[0];
    expect(conversationResource.sId).toBe(conversation.sId);
    expect(mentions).toEqual([
      { configurationId: GLOBAL_AGENTS_SID.DUST },
      { type: "user", userId: "usr_yuka" },
    ]);
    expect(content).toBe(
      `Comment on \`${scopedPath}\`:\n\n> Ship on Thursday.\n\n${MENTIONING.message.body}`
    );
  });

  it("creates one conversation per pod document and reuses it", async () => {
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      auth.getNonNullableUser().sId,
      workspace.sId
    );
    const scopedPath = `pod-${pod.sId}/notes.md`;

    await dispatchCommentMentions(memberAuth, {
      scopedPath,
      newMessages: [MENTIONING],
    });
    await dispatchCommentMentions(memberAuth, {
      scopedPath,
      newMessages: [MENTIONING],
    });

    const linked = await ConversationResource.fetchLatestForDocument(
      memberAuth,
      {
        space: pod,
        documentPath: scopedPath,
      }
    );
    expect(linked).not.toBeNull();
    expect(linked?.spaceId).toBe(pod.id);
    expect(posted).toHaveBeenCalledTimes(2);
    for (const [, { conversationResource }] of posted.mock.calls) {
      expect(conversationResource.sId).toBe(linked?.sId);
    }
  });

  it("posts nothing for comments without mentions", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [],
    });

    await dispatchCommentMentions(auth, {
      scopedPath: `conversation-${conversation.sId}/plan.md`,
      newMessages: [comment("Looks good.")],
    });

    expect(posted).not.toHaveBeenCalled();
  });

  it("does not throw when posting fails", async () => {
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

    await expect(
      dispatchCommentMentions(auth, {
        scopedPath: `conversation-${conversation.sId}/plan.md`,
        newMessages: [MENTIONING],
      })
    ).resolves.toBeUndefined();
  });
});
