import { getFrameShareLinkFromSource } from "@app/lib/api/frames/share_link_from_source";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { describe, expect, it } from "vitest";

async function setup() {
  const context = await createSandboxTokenTestContext();
  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
  const mountDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(context.auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 1,
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: context.conversation.sId },
    mountFilePath: `${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });

  return { ...context, frame, sourceDirectoryPath };
}

async function setupLegacy({
  contentType = frameContentType,
  status = "ready",
}: {
  contentType?: typeof frameContentType | "text/plain";
  // A ready legacy Frame always holds a share link; only a not-yet-ready one has none.
  status?: "created" | "ready";
} = {}) {
  const context = await createSandboxTokenTestContext();
  const fileName = "Status.tsx";
  const sourcePath = `conversation-${context.conversation.sId}/${fileName}`;
  const frame = await FileFactory.create(context.auth, null, {
    contentType,
    fileName,
    fileSize: 1,
    status,
    useCase: "conversation",
    useCaseMetadata: { conversationId: context.conversation.sId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}${fileName}`,
  });

  return { ...context, frame, sourcePath };
}

describe("getFrameShareLinkFromSource", () => {
  it("returns existing share information without changing it", async () => {
    const context = await setup();
    await context.frame.markFrameV2AsReadyFromMount(context.auth);
    await context.frame.setShareScope(context.auth, "emails_only");
    const before = await context.frame.getShareInfo();
    assert(before);

    const result = await getFrameShareLinkFromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(result.isOk());
    expect(result.value).toEqual({
      frameId: context.frame.sId,
      shareScope: before.scope,
      shareUrl: before.shareUrl,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });
    expect(await context.frame.getShareInfo()).toEqual(before);
  });

  it("does not create sharing state when the registered Frame has none", async () => {
    const context = await setup();

    const result = await getFrameShareLinkFromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(result.isErr());
    expect(result.error).toMatchObject({ code: "not_shared" });
    expect(await context.frame.getShareInfo()).toBeNull();
  });

  it("returns the existing share link of a legacy Frame from its entry file", async () => {
    const context = await setupLegacy();
    await context.frame.setShareScope(context.auth, "workspace");
    const before = await context.frame.getShareInfo();
    assert(before);

    const result = await getFrameShareLinkFromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourcePath,
    });

    assert(result.isOk());
    expect(result.value).toEqual({
      frameId: context.frame.sId,
      shareScope: before.scope,
      shareUrl: before.shareUrl,
      sourceDirectoryPath: context.sourcePath,
    });
    expect(await context.frame.getShareInfo()).toEqual(before);
  });

  it("does not create sharing state for an unshared legacy Frame", async () => {
    const context = await setupLegacy({ status: "created" });

    const result = await getFrameShareLinkFromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourcePath,
    });

    assert(result.isErr());
    expect(result.error).toMatchObject({ code: "not_shared" });
    expect(await context.frame.getShareInfo()).toBeNull();
  });

  it("rejects a file that is not a Frame", async () => {
    const context = await setupLegacy({ contentType: "text/plain" });

    const result = await getFrameShareLinkFromSource(context.auth, {
      conversation: context.conversation,
      sourceDirectoryPath: context.sourcePath,
    });

    assert(result.isErr());
    expect(result.error).toMatchObject({ code: "invalid_source" });
  });
});
