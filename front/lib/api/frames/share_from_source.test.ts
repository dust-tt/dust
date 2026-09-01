// Frame publication runs esbuild, whose TextEncoder invariant requires Node rather than jsdom.
// @vitest-environment node

import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { shareFrameV2FromSource } from "@app/lib/api/frames/share_from_source";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLockResult: async <T>(_name: string, cb: () => Promise<T>) =>
      cb(),
  };
});

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});

beforeEach(() => {
  fileStorageMock.reset();
});

describe("shareFrameV2FromSource", () => {
  it("updates use rights from a writable registered source", async () => {
    const context = await createSandboxTokenTestContext();
    const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const mountDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Status`;
    const frame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: context.conversation.sId },
      mountFilePath: `${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });
    const dataFile = await FileFactory.create(context.auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: context.conversation.sId },
    });
    const uiSource = `export default function Status() {
      useFile("${dataFile.sId}");
      return <p>Ready</p>;
    }`;
    const sourceByPath = new Map([
      [`${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
      [`${mountDirectoryPath}/index.tsx`, uiSource],
    ]);
    fileStorageMock.setFileContent((filePath) => {
      return sourceByPath.get(filePath) ?? null;
    });
    fileStorageMock.setFilesByPrefix((prefix) => {
      return prefix === `${mountDirectoryPath}/`
        ? [...sourceByPath].map(([name, content]) => ({
            name,
            metadata: {
              contentType: name.endsWith(".tsx")
                ? "text/typescript"
                : "application/json",
              size: String(Buffer.byteLength(content)),
            },
          }))
        : null;
    });

    await frame.markFrameV2AsReadyFromMount(context.auth);
    const publication = await publishFrameV2FromSource(context.auth, {
      conversation: context.conversation,
      frame,
      manifestPath,
    });
    assert(publication.isOk());

    const result = await shareFrameV2FromSource(context.auth, {
      conversation: context.conversation,
      emails: [context.auth.getNonNullableUser().email],
      shareScope: "emails_only",
      sourceDirectoryPath,
    });

    assert(result.isOk());
    expect(result.value).toMatchObject({
      emails: [context.auth.getNonNullableUser().email],
      frameId: frame.sId,
      shareScope: "emails_only",
      sourceDirectoryPath,
    });
    expect(await frame.getShareScope()).toBe("emails_only");
    expect(await frame.getActiveAuthorizedFileAccessShareScope()).toBe(
      "emails_only"
    );
    expect(await frame.listActiveSharingGrants()).toHaveLength(1);
  });
});
