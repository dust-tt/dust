import { getFrameShareLinkFromSource } from "@app/lib/api/frames/share_link_from_source";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
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
});
