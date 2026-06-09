import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
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

async function setupProjectConversation(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
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

  return { auth: projectAuth, conversation };
}

describe("createHandler", () => {
  it("returns Err when content_type is a frame MIME type", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/chart.tsx`,
        content: "export default function Chart() { return null; }",
        content_type: "application/vnd.dust.frame",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain(
      "interactive_content__create_interactive_content_file"
    );
  });

  it("returns Err when overwriting an existing frame file", async () => {
    const { auth, conversation } = await setupProjectConversation();

    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi
          .fn()
          .mockResolvedValue([
            { contentType: "application/vnd.dust.frame", size: "100" },
          ]),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/interactive.tsx`,
        content: "export default function App() { return null; }",
        content_type: "text/plain",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain(
      "interactive_content__edit_interactive_content_file"
    );
    expect(result.error.message).toContain("files__list");
  });
});
