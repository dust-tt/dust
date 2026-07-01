import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/conversation/retry_blocked_actions", () => ({
  retryBlockedActions: vi.fn(),
}));

import { createConversation } from "@app/lib/api/assistant/conversation";
import { resumeAncestorConversations } from "@app/lib/api/assistant/conversation/resume_ancestor_conversations";
import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

async function createAgenticConversation(
  auth: Authenticator,
  workspace: WorkspaceType,
  { agenticParentMessageId }: { agenticParentMessageId?: string } = {}
): Promise<{ conversation: ConversationResource; agentMessageId: string }> {
  const conversation = await createConversation(auth, {
    title: "Test Conversation",
    visibility: "unlisted",
    spaceId: null,
  });

  const { messageRow: userMessageRow } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
      rank: 0,
      agenticMessageType: agenticParentMessageId ? "run_agent" : undefined,
      agenticOriginMessageId: agenticParentMessageId,
    });

  const agentMessageRow = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conversation.id,
    rank: 1,
    agentConfigurationId: "test-agent",
    parentId: userMessageRow.id,
  });

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    throw new Error("Failed to fetch conversation resource");
  }

  return {
    conversation: conversationResource,
    agentMessageId: agentMessageRow.sId,
  };
}

describe("resumeAncestorConversations", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;
  });

  it("keeps walking up to higher ancestors when a parent loop is already running", async () => {
    const grandParent = await createAgenticConversation(auth, workspace);
    const parent = await createAgenticConversation(auth, workspace, {
      agenticParentMessageId: grandParent.agentMessageId,
    });
    const child = await createAgenticConversation(auth, workspace, {
      agenticParentMessageId: parent.agentMessageId,
    });

    vi.mocked(retryBlockedActions).mockResolvedValue(
      new Err(
        new DustError(
          "agent_loop_already_running",
          "Agent loop already running for this message."
        )
      )
    );

    const res = await resumeAncestorConversations(auth, child.conversation, {
      agentMessageId: child.agentMessageId,
    });

    expect(res.isOk()).toBe(true);
    // Starting the parent is a no-op (a sibling won the race), but we still walk
    // up and attempt to resume the grandparent so it is not stranded.
    expect(retryBlockedActions).toHaveBeenCalledTimes(2);
    expect(retryBlockedActions).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ sId: parent.conversation.sId }),
      expect.objectContaining({ messageId: parent.agentMessageId })
    );
    expect(retryBlockedActions).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ sId: grandParent.conversation.sId }),
      expect.objectContaining({ messageId: grandParent.agentMessageId })
    );
  });

  it("returns Err when retrying blocked actions fails for another reason", async () => {
    const parent = await createAgenticConversation(auth, workspace);
    const child = await createAgenticConversation(auth, workspace, {
      agenticParentMessageId: parent.agentMessageId,
    });

    vi.mocked(retryBlockedActions).mockResolvedValue(
      new Err(new Error("No blocked actions found"))
    );

    const res = await resumeAncestorConversations(auth, child.conversation, {
      agentMessageId: child.agentMessageId,
    });

    expect(res.isErr()).toBe(true);
  });

  it("returns Ok without retrying when there is no agentic parent", async () => {
    const root = await createAgenticConversation(auth, workspace);

    const res = await resumeAncestorConversations(auth, root.conversation, {
      agentMessageId: root.agentMessageId,
    });

    expect(res.isOk()).toBe(true);
    expect(retryBlockedActions).not.toHaveBeenCalled();
  });

  it("walks up multiple ancestors when each resumes successfully", async () => {
    const grandParent = await createAgenticConversation(auth, workspace);
    const parent = await createAgenticConversation(auth, workspace, {
      agenticParentMessageId: grandParent.agentMessageId,
    });
    const child = await createAgenticConversation(auth, workspace, {
      agenticParentMessageId: parent.agentMessageId,
    });

    vi.mocked(retryBlockedActions).mockResolvedValue(new Ok(undefined));

    const res = await resumeAncestorConversations(auth, child.conversation, {
      agentMessageId: child.agentMessageId,
    });

    expect(res.isOk()).toBe(true);
    expect(retryBlockedActions).toHaveBeenCalledTimes(2);
  });
});
