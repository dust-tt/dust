import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CREATE_CONTENT_MAX_BYTES,
  FILES_EDIT_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/collab/live_source", () => ({
  fetchLiveSource: vi.fn(),
  pushLiveSource: vi.fn(),
}));

describe("createHandler", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    vi.mocked(fetchLiveSource).mockResolvedValue(new Ok({ open: false }));
  });

  it("refuses to overwrite a Markdown document open in a live session", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "100",
    }));
    fileStorageMock.setFileContent(() => "# Notes\n\nShip on Thursday.");
    vi.mocked(fetchLiveSource).mockResolvedValue(
      new Ok({ open: true, source: "# Notes\n\nShip on Thursday." })
    );

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/notes.md`,
        content: "# Rewritten",
        content_type: "text/markdown",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isErr());
    expect(result.error.message).toContain(
      getPrefixedToolName(FILES_SERVER_NAME, FILES_EDIT_ACTION_NAME)
    );
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    expect(pushLiveSource).not.toHaveBeenCalled();
  });

  it("fills an empty Markdown document open in a live session through the session", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "0",
    }));
    fileStorageMock.setFileContent(() => "");
    vi.mocked(fetchLiveSource).mockResolvedValue(
      new Ok({ open: true, source: "" })
    );
    vi.mocked(pushLiveSource).mockResolvedValue(new Ok("written"));

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/notes.md`,
        content: "# Notes\n\nFirst draft.",
        content_type: "text/markdown",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
    const [, written] = vi.mocked(pushLiveSource).mock.calls[0];
    expect(written.source).toContain("First draft.");
  });

  it("overwrites a Markdown document no session holds", async () => {
    const { auth, conversation } = await setupProjectConversation();
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "100",
    }));

    const result = await createHandler(
      {
        path: `conversation-${conversation.sId}/notes.md`,
        content: "# Rewritten",
        content_type: "text/markdown",
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
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
    const content = "x".repeat(CREATE_CONTENT_MAX_BYTES + 1);

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
