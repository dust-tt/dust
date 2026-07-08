import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContextType } from "@app/lib/actions/types";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

function makeExtra(
  auth: Authenticator,
  conversation: ConversationType
): ToolHandlerExtra {
  const toolContext = {
    runContext: { contextType: "agent_loop", conversation },
  } as unknown as ToolContextType;
  return { auth, toolContext } as unknown as ToolHandlerExtra;
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
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("creates a new frame-typed file as a regular mount write", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileExists(() => false);

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
    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls[0].contentType).toBe(
      "application/vnd.dust.frame"
    );
  });

  it("overwrites an existing frame file, preserving its content type", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/vnd.dust.frame",
      size: "100",
    }));

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
    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls[0].contentType).toBe(
      "application/vnd.dust.frame"
    );
  });

  it("overwrites an existing frame file well over the generic 50 KB limit", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/vnd.dust.frame",
      size: "100",
    }));
    const content = "// padding\n".repeat(6000); // ~66 KB

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/interactive.tsx`,
        content,
        content_type: "text/plain",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
  });
});
