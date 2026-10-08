import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import { editHandler } from "@app/lib/api/actions/servers/files/tools/edit";
import { FRAME_SOURCE_MAX_BYTES } from "@app/lib/api/actions/servers/interactive_content/metadata";
import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
}));
vi.mock("@app/lib/api/collab/live_source", () => ({
  fetchLiveSource: vi.fn(),
  pushLiveSource: vi.fn(),
}));

function mockStoredFile(content: string, contentType: string) {
  fileStorageMock.setFileMetadata(() => ({
    contentType,
    size: String(Buffer.byteLength(content, "utf8")),
  }));
  fileStorageMock.setFileContent(() => content);
}

describe("editHandler", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    vi.mocked(fetchLiveSource)
      .mockReset()
      .mockResolvedValue(new Ok({ open: false }));
    vi.mocked(pushLiveSource).mockReset();
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

    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
    const { filePath, content, contentType } = fileStorageMock.saveFileCalls[0];
    expect(content.toString("utf8")).toBe("const label = 'Hello Dust';\n");
    expect(contentType).toBe("text/plain");
    expect(filePath).toBe(
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
    expect(fileStorageMock.saveFileCalls[0].content.toString("utf8")).toBe(
      "c b c b c\n"
    );
  });

  it("appends a publish reminder when editing a Frame source file", async () => {
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
        "interactive_content__publish_interactive_content_file"
      ),
    });

    expect(fileStorageMock.saveFileCalls[0].contentType).toBe(
      "application/vnd.dust.frame"
    );
  });

  it("returns Err when the file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileExists(() => false);

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
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns Err when old_string is not found", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("some content\n", "text/plain");
    const oldString = "absent";

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/notes.txt`,
        old_string: oldString,
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(`String "${oldString}" not found`);
    }
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
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
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
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
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns Err when the file exceeds the size limit", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/plain",
      size: String(CREATE_CONTENT_MAX_BYTES + 1),
    }));

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
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("edits a Frame source file well over the generic 50 KB limit", async () => {
    const { auth, conversation } = await setupProjectConversation();
    // A Frame template can legitimately exceed the generic files-server cap.
    const padding = "x".repeat(CREATE_CONTENT_MAX_BYTES + 1);
    mockStoredFile(
      `// ${padding}\nexport default function App() { return <h1>Old</h1>; }\n`,
      frameContentType
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
    expect(fileStorageMock.saveFileCalls[0].content.toString("utf8")).toContain(
      "New"
    );
  });

  it("returns Err when a Frame source file exceeds its own, larger size limit", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: frameContentType,
      size: String(FRAME_SOURCE_MAX_BYTES + 1),
    }));

    const result = await editHandler(
      {
        path: `conversation-${conversation.sId}/App.tsx`,
        old_string: "a",
        new_string: "b",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("KB limit");
    }
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  describe("a Markdown document open in a live session", () => {
    const STORED = "# Notes\n\nShip on Thursday.";
    // The session is ahead of the file until its next checkpoint.
    const LIVE = "# Notes\n\nShip on Thursday. Typed live.";

    it("edits it through the session, not the file", async () => {
      const { auth, conversation } = await setupProjectConversation();
      mockStoredFile(STORED, "text/markdown");
      vi.mocked(fetchLiveSource).mockResolvedValue(
        new Ok({ open: true, source: LIVE })
      );
      vi.mocked(pushLiveSource).mockResolvedValue(new Ok("written"));

      const result = await editHandler(
        {
          path: `conversation-${conversation.sId}/notes.md`,
          old_string: "Typed live.",
          new_string: "Typed live, then edited.",
        },
        makeExtra(auth, conversation)
      );

      assert(result.isOk());
      expect(result.value[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("open in a live session"),
      });
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
      const [, written] = vi.mocked(pushLiveSource).mock.calls[0];
      expect(written.base).toBe(LIVE);
      expect(written.source).toContain("Typed live, then edited.");
    });

    it("looks the session up without a trailing slash", async () => {
      const { auth, conversation } = await setupProjectConversation();
      mockStoredFile(STORED, "text/markdown");
      vi.mocked(fetchLiveSource).mockResolvedValue(
        new Ok({ open: true, source: LIVE })
      );
      vi.mocked(pushLiveSource).mockResolvedValue(new Ok("written"));

      const result = await editHandler(
        {
          path: `conversation-${conversation.sId}/notes.md/`,
          old_string: "Typed live.",
          new_string: "Typed live, then edited.",
        },
        makeExtra(auth, conversation)
      );

      assert(result.isOk());
      expect(vi.mocked(fetchLiveSource).mock.calls[0][1]).toBe(
        `conversation-${conversation.sId}/notes.md`
      );
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    });

    it("writes the file when no session holds it", async () => {
      const { auth, conversation } = await setupProjectConversation();
      mockStoredFile(STORED, "text/markdown");

      const result = await editHandler(
        {
          path: `conversation-${conversation.sId}/notes.md`,
          old_string: "Thursday",
          new_string: "Friday",
        },
        makeExtra(auth, conversation)
      );

      assert(result.isOk());
      expect(pushLiveSource).not.toHaveBeenCalled();
      expect(fileStorageMock.saveFileCalls[0].content.toString("utf8")).toBe(
        "# Notes\n\nShip on Friday."
      );
    });

    it("refuses an edit the session's source does not allow, writing nothing", async () => {
      const { auth, conversation } = await setupProjectConversation();
      mockStoredFile(STORED, "text/markdown");
      vi.mocked(fetchLiveSource).mockResolvedValue(
        new Ok({ open: true, source: LIVE })
      );

      const result = await editHandler(
        {
          path: `conversation-${conversation.sId}/notes.md`,
          old_string: "Nowhere.",
          new_string: "Somewhere.",
        },
        makeExtra(auth, conversation)
      );

      assert(result.isErr());
      // `edit_document`'s wording, not the file path's.
      expect(result.error.message).toContain("read it again");
      expect(pushLiveSource).not.toHaveBeenCalled();
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    });
  });
});
