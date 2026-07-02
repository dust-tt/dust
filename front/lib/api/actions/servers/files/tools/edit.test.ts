import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { editHandler } from "@app/lib/api/actions/servers/files/tools/edit";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
}));

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

describe("editHandler", () => {
  let existsMock: ReturnType<typeof vi.fn>;
  let getMetadataMock: ReturnType<typeof vi.fn>;
  let createReadStreamMock: ReturnType<typeof vi.fn>;
  let saveMock: ReturnType<typeof vi.fn>;
  let fileMock: ReturnType<typeof vi.fn>;

  function mockStoredFile(content: string, contentType: string) {
    existsMock.mockResolvedValue([true]);
    getMetadataMock.mockResolvedValue([
      { contentType, size: String(Buffer.byteLength(content, "utf8")) },
    ]);
    createReadStreamMock.mockImplementation(() =>
      Readable.from([Buffer.from(content, "utf8")])
    );
  }

  beforeEach(() => {
    existsMock = vi.fn().mockResolvedValue([true]);
    getMetadataMock = vi
      .fn()
      .mockResolvedValue([{ contentType: "text/plain", size: "0" }]);
    createReadStreamMock = vi.fn(() => Readable.from([Buffer.from("")]));
    saveMock = vi.fn().mockResolvedValue(undefined);
    fileMock = vi.fn(() => ({
      exists: existsMock,
      getMetadata: getMetadataMock,
      createReadStream: createReadStreamMock,
      save: saveMock,
    }));

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: fileMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("replaces a string and writes back with the original content type", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    mockStoredFile("const label = 'Hello world';\n", "text/plain");

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/notes.txt`,
        old_string: "Hello world",
        new_string: "Hello Dust",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(result.value[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("made 1 replacement"),
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    const [savedContent, saveOpts] = saveMock.mock.calls[0];
    expect(savedContent.toString("utf8")).toBe("const label = 'Hello Dust';\n");
    expect(saveOpts).toMatchObject({ contentType: "text/plain" });
    expect(fileMock).toHaveBeenCalledWith(
      `w/${workspaceId}/conversations/${conversation.sId}/files/notes.txt`
    );
  });

  it("replaces multiple occurrences when expected_replacements matches", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("a b a b a\n", "text/plain");

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/notes.txt`,
        old_string: "a",
        new_string: "c",
        expected_replacements: 3,
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(saveMock.mock.calls[0][0].toString("utf8")).toBe("c b c b c\n");
  });

  it("appends a publish reminder when editing a Frame source with frame_publish enabled", async () => {
    const { auth, conversation } = await setupProjectConversation();
    await FeatureFlagFactory.basic(auth, "frame_publish");
    mockStoredFile(
      "export default function App() { return <h1>Old</h1>; }\n",
      "application/vnd.dust.frame"
    );

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/App.tsx`,
        old_string: "Old",
        new_string: "New",
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

    expect(saveMock.mock.calls[0][1]).toMatchObject({
      contentType: "application/vnd.dust.frame",
    });
  });

  it("points at the file-id edit tool when editing a Frame source without frame_publish", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile(
      "export default function App() { return <h1>Old</h1>; }\n",
      "application/vnd.dust.frame"
    );

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/App.tsx`,
        old_string: "Old",
        new_string: "New",
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

  it("returns Err when the file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();
    existsMock.mockResolvedValue([false]);

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/missing.txt`,
        old_string: "a",
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not found");
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("returns Err when old_string is not found", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("some content\n", "text/plain");

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/notes.txt`,
        old_string: "absent",
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("String not found");
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("returns Err when occurrences do not match expected_replacements", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("a b a\n", "text/plain");

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/notes.txt`,
        old_string: "a",
        new_string: "c",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Expected 1 replacements, but found 2 occurrences"
      );
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("returns Err for a binary file", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("binary", "image/png");

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/logo.png`,
        old_string: "a",
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("binary file");
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("returns Err when the file exceeds the size limit", async () => {
    const { auth, conversation } = await setupProjectConversation();
    existsMock.mockResolvedValue([true]);
    getMetadataMock.mockResolvedValue([
      { contentType: "text/plain", size: String(51 * 1024) },
    ]);

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/big.txt`,
        old_string: "a",
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("KB limit");
    }
    expect(saveMock).not.toHaveBeenCalled();
  });
});
