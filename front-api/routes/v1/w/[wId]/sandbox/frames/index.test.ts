// Legacy Frame publishing runs esbuild, whose TextEncoder invariant requires Node rather than jsdom.
// @vitest-environment node

import { FileResource } from "@app/lib/resources/file_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_name: string, cb: () => Promise<T>) => cb(),
  };
});

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

function requestFramePublish(
  workspaceId: string,
  token: string,
  manifestPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/publish`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ manifestPath }),
  });
}

function requestFrameRegister(
  workspaceId: string,
  token: string,
  manifestPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/register`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ manifestPath }),
  });
}

function requestFrameMove(
  workspaceId: string,
  token: string,
  sourceDirectoryPath: string,
  destinationDirectoryPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/move`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourceDirectoryPath, destinationDirectoryPath }),
  });
}

function requestFrameDelete(
  workspaceId: string,
  token: string,
  sourceDirectoryPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/delete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourceDirectoryPath }),
  });
}

async function setup({ registered = true }: { registered?: boolean } = {}) {
  const context = await createSandboxTokenTestContext();
  await FeatureFlagFactory.basic(context.auth, "frames_v2");
  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const mountDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  })}Status`;
  const frame = registered
    ? await FileFactory.create(context.auth, null, {
        contentType: frameV2ContentType,
        fileName: FRAME_MANIFEST_FILE,
        fileSize: Buffer.byteLength(manifest),
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: context.conversation.sId },
        mountFilePath: `${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`,
      })
    : null;
  const sourceByPath = new Map([
    [`${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
    [`${mountDirectoryPath}/index.tsx`, uiSource],
  ]);
  for (const [filePath, content] of sourceByPath) {
    fileStorageMock.setObject(filePath, content);
  }
  fileStorageMock.setFileContent((path) => sourceByPath.get(path) ?? null);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${mountDirectoryPath}/`
      ? [...sourceByPath.entries()]
          .filter(([name]) => fileStorageMock.getObject(name) !== undefined)
          .map(([name, content], index) => ({
            name,
            metadata: {
              contentType: name.endsWith(".tsx")
                ? "text/typescript"
                : "application/json",
              generation: String(index + 1),
              size: String(Buffer.byteLength(content)),
            },
          }))
      : null
  );

  return { ...context, frame, manifestPath };
}

async function setupLegacyFrame() {
  const context = await createSandboxTokenTestContext();
  await FeatureFlagFactory.basic(context.auth, "frames_v2");
  const sourcePath = `conversation-${context.conversation.sId}/Legacy.tsx`;
  const mountDirectoryPath = getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  });
  const mountFilePath = `${mountDirectoryPath}Legacy.tsx`;
  const frame = await FileFactory.create(context.auth, null, {
    contentType: frameContentType,
    fileName: "Legacy.tsx",
    fileSize: Buffer.byteLength(uiSource),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: context.conversation.sId },
    mountFilePath,
  });
  // The legacy publisher reads the source from its mount and the rendered bundle back from the
  // canonical FileResource path when recomputing the share allowlist.
  fileStorageMock.setFileContent(() => uiSource);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === mountDirectoryPath
      ? [
          {
            name: mountFilePath,
            metadata: {
              contentType: "text/typescript",
              size: String(Buffer.byteLength(uiSource)),
            },
          },
        ]
      : null
  );

  return { ...context, frame, sourcePath };
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("POST /api/v1/w/[wId]/sandbox/frames", () => {
  it("registers one stable Frame identity", async () => {
    const context = await setup({ registered: false });

    const firstResponse = await requestFrameRegister(
      context.workspace.sId,
      context.token,
      context.manifestPath
    );
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json();
    expect(first.created).toBe(true);

    const secondResponse = await requestFrameRegister(
      context.workspace.sId,
      context.token,
      context.manifestPath
    );
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect(second).toMatchObject({ frameId: first.frameId, created: false });
  });

  it("publishes a registered Frame through the sandbox token", async () => {
    const context = await setup();
    assert(context.frame);

    const response = await requestFramePublish(
      context.workspace.sId,
      context.token,
      context.manifestPath
    );
    expect(response.status).toBe(200);
    const published = await response.json();
    expect(published.frameId).toBe(context.frame.sId);
    expect(published.publicationId).toBeTypeOf("string");

    const frame = await FileResource.fetchById(context.auth, published.frameId);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(
      published.publicationId
    );
  });

  it("moves a registered Frame folder while preserving its identity", async () => {
    const context = await setup();
    assert(context.frame);
    fileStorageMock.setFileExists(() => false);
    const sourceDirectoryPath = context.manifestPath.replace(
      `/${FRAME_MANIFEST_FILE}`,
      ""
    );
    const destinationDirectoryPath = sourceDirectoryPath.replace(
      "/Status",
      "/Renamed"
    );

    const response = await requestFrameMove(
      context.workspace.sId,
      context.token,
      sourceDirectoryPath,
      destinationDirectoryPath
    );

    const moved = await response.json();
    expect(response.status, JSON.stringify(moved)).toBe(200);
    expect(moved).toEqual({
      destinationDirectoryPath,
      frameId: context.frame.sId,
      sourceDeletionFailed: false,
    });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.toScopedPath(context.auth)).toBe(
      `${destinationDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
  });

  it("deletes a registered Frames v2 package through the sandbox token", async () => {
    const context = await setup();
    assert(context.frame);
    await context.frame.markFrameV2AsReadyFromMount(context.auth);
    fileStorageMock.setFileExists((filePath) => filePath.endsWith("/"));
    const sourceDirectoryPath = context.manifestPath.replace(
      `/${FRAME_MANIFEST_FILE}`,
      ""
    );

    const response = await requestFrameDelete(
      context.workspace.sId,
      context.token,
      sourceDirectoryPath
    );

    const deleted = await response.json();
    expect(response.status, JSON.stringify(deleted)).toBe(200);
    expect(deleted).toEqual({
      frameId: context.frame.sId,
      sourceDirectoryPath,
    });
    await expect(
      FileResource.fetchById(context.auth, context.frame.sId)
    ).resolves.toBeNull();
  });

  it("publishes a legacy Frame through its existing publication flow", async () => {
    const context = await setupLegacyFrame();

    const response = await requestFramePublish(
      context.workspace.sId,
      context.token,
      context.sourcePath
    );

    const published = await response.json();
    expect(response.status, JSON.stringify(published)).toBe(200);
    expect(published).toEqual({
      frameId: context.frame.sId,
      manifestPath: context.sourcePath,
      warnings: [],
    });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.useCaseMetadata?.frameBundleRootPath).toBe(
      `conversation-${context.conversation.sId}`
    );
    expect(frame?.useCaseMetadata?.frameEntryRelPath).toBe("Legacy.tsx");
    expect(frame?.useCaseMetadata?.lastEditedByAgentConfigurationId).toBe(
      context.agentConfig.sId
    );
  });

  it("rejects an unregistered manifest path", async () => {
    const context = await setup();
    const unregisteredPath = context.manifestPath.replace(
      "/Status/",
      "/Other/"
    );

    const response = await requestFramePublish(
      context.workspace.sId,
      context.token,
      unregisteredPath
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: `No Frame found at ${unregisteredPath}.` },
    });
  });

  it("refuses publication without the feature flag", async () => {
    const context = await createSandboxTokenTestContext();

    const response = await requestFramePublish(
      context.workspace.sId,
      context.token,
      `conversation-${context.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );

    expect(response.status).toBe(403);
  });
});
