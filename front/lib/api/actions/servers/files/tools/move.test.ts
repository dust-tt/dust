import { moveHandler } from "@app/lib/api/actions/servers/files/tools/move";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getFilePreviewDirectiveInstruction } from "@app/lib/markdown/file_preview";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { describe, expect, it } from "vitest";

describe("moveHandler", () => {
  it("moves a file from conversation to pod mount", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    // Source (conversation) exists, destination (pod) does not.
    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/conversations/")
    );

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/report.pdf`,
        dest: `pod-${projectId}/report.pdf`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value[0]).toEqual({
      type: "text",
      text:
        `Moved \`conversation-${conversation.sId}/report.pdf\` to \`pod-${projectId}/report.pdf\`. ` +
        getFilePreviewDirectiveInstruction({
          contentType: "text/plain",
          path: `pod-${projectId}/report.pdf`,
          title: "report.pdf",
        }),
    });
  });

  it("moves a file from pod to conversation mount", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    // Source (pod) exists, destination (conversation) does not.
    fileStorageMock.setFileExists((filePath) => filePath.includes("/pods/"));

    const result = await moveHandler(
      {
        source: `pod-${projectId}/spec.md`,
        dest: `conversation-${conversation.sId}/spec.md`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns Err when the source file does not exist", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    fileStorageMock.setFileExists(() => false);

    const result = await moveHandler(
      {
        source: `conversation-${conversation.sId}/missing.pdf`,
        dest: `pod-${projectId}/missing.pdf`,
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
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await moveHandler(
      { source: "other/foo.md", dest: `pod-${projectId}/foo.md` },
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
