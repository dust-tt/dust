import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

const UI_SOURCE = "export default function Status() { return <p>Ready</p>; }";

function makeManifest(uiEntryPoint?: string) {
  return JSON.stringify({
    version: 1,
    name: "Status",
    description: "Show the current status.",
    ...(uiEntryPoint ? { uiEntryPoint } : {}),
  });
}

async function setupFrame({ manifest }: { manifest: string }) {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const gcsSourceDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });

  return { frame, gcsSourceDirectoryPath, workspace };
}

describe("GET /api/w/:wId/frames/:frameId/source", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("returns the entry file the manifest points at", async () => {
    const manifest = makeManifest("app/Status.tsx");
    const { frame, gcsSourceDirectoryPath, workspace } = await setupFrame({
      manifest,
    });
    const sourceByPath = new Map([
      [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
      [`${gcsSourceDirectoryPath}/app/Status.tsx`, UI_SOURCE],
    ]);
    fileStorageMock.setFileContent(
      (filePath) => sourceByPath.get(filePath) ?? null
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/source`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe(UI_SOURCE);
  });

  it("falls back to the default entry point when the manifest omits one", async () => {
    const manifest = makeManifest();
    const { frame, gcsSourceDirectoryPath, workspace } = await setupFrame({
      manifest,
    });
    const sourceByPath = new Map([
      [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
      [`${gcsSourceDirectoryPath}/index.tsx`, UI_SOURCE],
    ]);
    fileStorageMock.setFileContent(
      (filePath) => sourceByPath.get(filePath) ?? null
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/source`
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(UI_SOURCE);
  });

  it("returns 404 when the entry file is missing from the source folder", async () => {
    const manifest = makeManifest();
    const { frame, gcsSourceDirectoryPath, workspace } = await setupFrame({
      manifest,
    });
    fileStorageMock.setFileContent((filePath) =>
      filePath === `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`
        ? manifest
        : null
    );
    fileStorageMock.setFileExists(
      (filePath) => filePath !== `${gcsSourceDirectoryPath}/index.tsx`
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/source`
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the Frame has no source folder", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/source`
    );

    expect(response.status).toBe(404);
  });

  it("does not expose the source of a legacy Frame", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/source`
    );

    expect(response.status).toBe(404);
  });
});
