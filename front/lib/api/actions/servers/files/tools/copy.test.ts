import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { getFilePreviewDirectiveInstruction } from "@app/lib/markdown/file_preview";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("copyHandler", () => {
  it("copies a file from conversation to pod mount", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await copyHandler(
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
        `Copied \`conversation-${conversation.sId}/report.pdf\` to \`pod-${projectId}/report.pdf\`. ` +
        getFilePreviewDirectiveInstruction({
          contentType: "text/plain",
          path: `pod-${projectId}/report.pdf`,
          title: "report.pdf",
        }),
    });
    expect(result.value[1]).toMatchObject({
      type: "resource",
      resource: {
        path: `pod-${projectId}/report.pdf`,
        title: "report.pdf",
        contentType: "text/plain",
      },
    });
  });

  it("copies a file from pod to conversation mount", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await copyHandler(
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

    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
        getMetadata: vi.fn().mockRejectedValue(new Error("Not Found")),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const result = await copyHandler(
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

  it("returns Err when the source is a frame file", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

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

    const result = await copyHandler(
      {
        source: `conversation-${conversation.sId}/interactive.html`,
        dest: `pod-${projectId}/interactive.html`,
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("files__move");
  });

  it("returns Err when source and dest are the same path", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
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

    const result = await copyHandler(
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

    const result = await copyHandler(
      {
        source: `conversation-${conversation.sId}/x.md`,
        dest: "pod-someid/x.md",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
  });

  it("writes to the correct pod storage path when copying to a pod mount", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const copyFileMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi
          .fn()
          .mockResolvedValue([{ contentType: "application/pdf", size: "100" }]),
      })),
      copyFile: copyFileMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const result = await copyHandler(
      {
        source: `conversation-${conversation.sId}/report.pdf`,
        dest: `pod-${projectId}/report.pdf`,
      },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());

    const sourcePath = `w/${workspaceId}/conversations/${conversation.sId}/files/report.pdf`;
    const destPodsPath = `w/${workspaceId}/pods/${projectId}/files/report.pdf`;

    expect(copyFileMock).toHaveBeenCalledWith(sourcePath, destPodsPath);
  });
});
