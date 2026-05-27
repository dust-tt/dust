import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { moveHandler } from "@app/lib/api/actions/servers/files/tools/move";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

function makeExtra(
  auth: Authenticator,
  conversation: ConversationType
): ToolHandlerExtra {
  const agentLoopContext = {
    runContext: { conversation },
  } as unknown as AgentLoopContextType;
  return { auth, agentLoopContext } as unknown as ToolHandlerExtra;
}

async function setupProjectConversation(
  role: "admin" | "user" = "admin"
): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  spaceId: string;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({ role });
  const user = auth.getNonNullableUser();

  const space = await SpaceFactory.project(workspace, user.id);
  const addRes = await space.addMembers(auth, { userIds: [user.sId] });
  assert(addRes.isOk(), "Failed to add user to project space");

  const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await createConversation(projectAuth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: space.id,
  });

  return {
    auth: projectAuth,
    conversation,
    spaceId: space.sId,
  };
}

describe("moveHandler", () => {
  it("moves a file from conversation to pod mount", async () => {
    const { auth, conversation, spaceId } = await setupProjectConversation();

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/report.pdf`,
        dest: `pod-${spaceId}/report.pdf`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value[0]).toEqual({
      type: "text",
      text: `Moved \`conversation-${conversation.sId}/report.pdf\` to \`pod-${spaceId}/report.pdf\`.`,
    });
  });

  it("moves a file from pod to conversation mount", async () => {
    const { auth, conversation, spaceId } = await setupProjectConversation();

    const result = await moveHandler(
      {
        source: `pod-${spaceId}/spec.md`,
        dest: `conversation-${conversation.sId}/spec.md`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns Err when the source file does not exist", async () => {
    const { auth, conversation, spaceId } = await setupProjectConversation();

    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
        getMetadata: vi.fn().mockRejectedValue(new Error("Not Found")),
        delete: vi.fn().mockResolvedValue(undefined),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/missing.pdf`,
        dest: `pod-${spaceId}/missing.pdf`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("Source file not found");
  });

  it("returns Err when source and dest are the same path", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/x.md`,
        dest: `conversation-${conversation.sId}/x.md`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("same path");
  });

  it("returns Err for an invalid source path prefix", async () => {
    const { auth, conversation, spaceId } = await setupProjectConversation();

    const result = await moveHandler(
      { source: "other/foo.md", dest: `pod-${spaceId}/foo.md` },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
  });

  it("returns Err for a pod path in a non-project conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/x.md`,
        dest: "pod-someid/x.md",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
  });
});
