import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
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
  it("creates a new frame-typed file as a regular mount write", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
        save: saveMock,
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/chart.tsx`,
        content: "export default function Chart() { return null; }",
        content_type: "application/vnd.dust.frame",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(result.value[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Created"),
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][1]).toMatchObject({
      contentType: "application/vnd.dust.frame",
    });
  });

  it("overwrites an existing frame file, preserving its content type", async () => {
    const { auth, conversation } = await setupProjectConversation();
    await FeatureFlagFactory.basic(auth, "frame_publish");

    const saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi
          .fn()
          .mockResolvedValue([
            { contentType: "application/vnd.dust.frame", size: "100" },
          ]),
        save: saveMock,
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

    assert(result.isOk());
    expect(result.value[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "interactive_content__publish_interactive_content_file"
      ),
    });

    // The mount object must keep the frame content type, not the incoming one.
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][1]).toMatchObject({
      contentType: "application/vnd.dust.frame",
    });
  });

  it("overwrites an existing frame file without frame_publish, pointing at the file-id edit tool", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi
          .fn()
          .mockResolvedValue([
            { contentType: "application/vnd.dust.frame", size: "100" },
          ]),
        save: saveMock,
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

    assert(result.isOk());
    expect(result.value[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "interactive_content__edit_interactive_content_file"
      ),
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
