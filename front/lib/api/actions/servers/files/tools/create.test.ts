import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import { createHandler } from "@app/lib/api/actions/servers/files/tools/create";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

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
