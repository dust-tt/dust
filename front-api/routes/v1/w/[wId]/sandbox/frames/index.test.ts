// Legacy Frame publishing runs esbuild, whose TextEncoder invariant requires Node rather than jsdom.
// @vitest-environment node

import { ConversationModel } from "@app/lib/models/agent/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

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

function requestFrameValidate(
  workspaceId: string,
  token: string,
  manifestPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/validate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ manifestPath }),
  });
}

function requestFrameShare(
  workspaceId: string,
  token: string,
  sourceDirectoryPath: string
) {
  const query = new URLSearchParams({ sourceDirectoryPath });
  return honoApp.request(
    `/api/v1/w/${workspaceId}/sandbox/frames/share?${query.toString()}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );
}

function requestFrameConvert(
  workspaceId: string,
  token: string,
  sourcePath: string,
  manifestPath: string
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/convert`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourcePath, manifestPath }),
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
  fileStorageMock.setFileContent((path) => sourceByPath.get(path) ?? null);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${mountDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? "text/typescript"
              : "application/json",
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

async function setupLegacyFrameConversion({
  includeUi = true,
}: {
  includeUi?: boolean;
} = {}) {
  const context = await setupLegacyFrame();
  await context.frame.ensureShareableFrame(context.auth);
  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Converted`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const mountDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  })}Converted`;
  const sourceByPath = new Map([
    [`${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
    ...(includeUi
      ? ([[`${mountDirectoryPath}/index.tsx`, uiSource]] as const)
      : []),
  ]);
  fileStorageMock.setFileContent(
    (filePath) => sourceByPath.get(filePath) ?? null
  );
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${mountDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? "text/typescript"
              : "application/json",
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );

  return {
    ...context,
    manifestMountFilePath: `${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    manifestPath,
  };
}

async function markLegacyFrameConversionPending(
  context: Awaited<ReturnType<typeof setupLegacyFrameConversion>>,
  { publicationId }: { publicationId?: string } = {}
) {
  const legacyBinding = {
    contentType: context.frame.contentType,
    fileName: context.frame.fileName,
    fileSize: context.frame.fileSize,
    mountFilePath: context.frame.mountFilePath!,
    useCase: context.frame.useCase,
    useCaseMetadata: context.frame.useCaseMetadata ?? {},
  };
  await context.frame.updateFrameSourceBinding({
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    mountFilePath: context.manifestMountFilePath,
    useCase: "conversation",
    useCaseMetadata: {
      ...(publicationId ? { activePublicationId: publicationId } : {}),
      conversationId: context.conversation.sId,
      pendingFrameV2Conversion: {
        legacyContentType: frameContentType,
        legacyFileName: legacyBinding.fileName,
        legacyFileSize: legacyBinding.fileSize,
        legacyMountFilePath: legacyBinding.mountFilePath,
        legacyRenderableVersion: "original",
        legacyUseCase: legacyBinding.useCase,
        legacyUseCaseMetadata: legacyBinding.useCaseMetadata,
        manifestMountFilePath: context.manifestMountFilePath,
        manifestPath: context.manifestPath,
        sourcePath: context.sourcePath,
      },
    },
  });
}

function seedLegacyCanonicalArtifacts(
  context: Awaited<ReturnType<typeof setupLegacyFrameConversion>>
) {
  const canonicalPaths = (["original", "processed", "public"] as const).map(
    (version) => context.frame.getCloudStoragePath(context.auth, version)
  );
  for (const canonicalPath of canonicalPaths) {
    fileStorageMock.setObject(canonicalPath, "legacy artifact");
  }
  fileStorageMock.setObject(context.frame.mountFilePath!, uiSource);
  return canonicalPaths;
}

beforeEach(() => {
  fileStorageMock.reset();
  mockEmitAuditLogEvent.mockClear();
});

describe("POST /api/v1/w/[wId]/sandbox/frames", () => {
  it("converts a legacy Frame while preserving identity and use rights", async () => {
    const context = await setupLegacyFrameConversion();
    const shareInfo = await context.frame.getShareInfo();
    const canonicalPaths = seedLegacyCanonicalArtifacts(context);
    const legacyMountPath = context.frame.mountFilePath!;

    const response = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    const converted = await response.json();
    expect(response.status, JSON.stringify(converted)).toBe(200);
    expect(converted).toMatchObject({
      frameId: context.frame.sId,
      manifestPath: context.manifestPath,
      publicationId: expect.any(String),
    });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.isFrameV2).toBe(true);
    expect(frame?.toScopedPath(context.auth)).toBe(context.manifestPath);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(
      converted.publicationId
    );
    expect(frame?.useCaseMetadata?.pendingFrameV2Conversion).toBeUndefined();
    expect(await frame?.getShareInfo()).toEqual(shareInfo);
    for (const canonicalPath of canonicalPaths) {
      expect(fileStorageMock.getObject(canonicalPath)).toBeUndefined();
    }
    expect(fileStorageMock.getObject(legacyMountPath)).toBe(uiSource);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.converted",
        metadata: {
          manifest_path: context.manifestPath,
          publication_id: converted.publicationId,
          source_path: context.sourcePath,
        },
      })
    );
  });

  it("publishes the same source snapshot that conversion validates", async () => {
    const context = await setupLegacyFrameConversion();
    const mountManifestPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Converted/${FRAME_MANIFEST_FILE}`;
    const mountUiPath = mountManifestPath.replace(
      FRAME_MANIFEST_FILE,
      "index.tsx"
    );
    const manifestWithDatabase = JSON.stringify({
      version: 1,
      name: "Status",
      description: "Show the current status.",
      databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
    });
    let manifestReadCount = 0;
    fileStorageMock.setFileContent((filePath) => {
      if (filePath === mountManifestPath) {
        manifestReadCount += 1;
        return manifestReadCount === 1 ? manifest : manifestWithDatabase;
      }
      return filePath === mountUiPath ? uiSource : null;
    });

    const response = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(response.status, await response.text()).toBe(200);
    expect(manifestReadCount).toBe(1);
  });

  it("restores the legacy Frame when its first v2 publication fails", async () => {
    const context = await setupLegacyFrameConversion({ includeUi: false });
    const shareInfo = await context.frame.getShareInfo();

    const response = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(response.status).toBe(400);
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.isInteractiveContent).toBe(true);
    expect(frame?.isFrameV2).toBe(false);
    expect(frame?.toScopedPath(context.auth)).toBe(context.sourcePath);
    expect(await frame?.getShareInfo()).toEqual(shareInfo);
  });

  it("finalizes an activated conversion left with its transition marker", async () => {
    const context = await setupLegacyFrameConversion();
    const canonicalPaths = seedLegacyCanonicalArtifacts(context);
    const legacyMountPath = context.frame.mountFilePath!;
    const publicationId = "already-active";
    await markLegacyFrameConversionPending(context, { publicationId });

    const response = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ publicationId });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.useCaseMetadata?.pendingFrameV2Conversion).toBeUndefined();
    for (const canonicalPath of canonicalPaths) {
      expect(fileStorageMock.getObject(canonicalPath)).toBeUndefined();
    }
    expect(fileStorageMock.getObject(legacyMountPath)).toBe(uiSource);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.converted",
        metadata: {
          manifest_path: context.manifestPath,
          publication_id: publicationId,
          source_path: context.sourcePath,
        },
      })
    );
  });

  it("retries legacy artifact cleanup before clearing the transition marker", async () => {
    const context = await setupLegacyFrameConversion();
    const canonicalPaths = seedLegacyCanonicalArtifacts(context);
    const publicationId = "already-active";
    await markLegacyFrameConversionPending(context, { publicationId });
    fileStorageMock.setFileDeleteFails(
      (path) =>
        path === context.frame.getCloudStoragePath(context.auth, "processed")
    );

    const failedResponse = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(failedResponse.status).toBe(500);
    const pendingFrame = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(
      pendingFrame?.useCaseMetadata?.pendingFrameV2Conversion
    ).toBeDefined();

    fileStorageMock.setFileDeleteFails(() => false);
    const recoveredResponse = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(recoveredResponse.status).toBe(200);
    const recoveredFrame = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(
      recoveredFrame?.useCaseMetadata?.pendingFrameV2Conversion
    ).toBeUndefined();
    for (const canonicalPath of canonicalPaths) {
      expect(fileStorageMock.getObject(canonicalPath)).toBeUndefined();
    }
  });

  it("restores a pending conversion when its manifest is no longer valid", async () => {
    const context = await setupLegacyFrameConversion();
    const shareInfo = await context.frame.getShareInfo();
    await markLegacyFrameConversionPending(context);
    fileStorageMock.setFileContent(() => "not-json");

    const response = await requestFrameConvert(
      context.workspace.sId,
      context.token,
      context.sourcePath,
      context.manifestPath
    );

    expect(response.status).not.toBe(200);
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.isInteractiveContent).toBe(true);
    expect(frame?.isFrameV2).toBe(false);
    expect(frame?.toScopedPath(context.auth)).toBe(context.sourcePath);
    expect(frame?.useCaseMetadata?.pendingFrameV2Conversion).toBeUndefined();
    expect(await frame?.getShareInfo()).toEqual(shareInfo);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "frame.converted" })
    );
  });

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

  it("validates a registered Frame without activating a publication", async () => {
    const context = await setup();
    assert(context.frame);

    const response = await requestFrameValidate(
      context.workspace.sId,
      context.token,
      context.manifestPath
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      frameId: context.frame.sId,
      manifestPath: context.manifestPath,
      warnings: [],
    });
    expect(
      (await FileResource.fetchById(context.auth, context.frame.sId))
        ?.useCaseMetadata?.activePublicationId
    ).toBeUndefined();
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("does not validate a legacy Frame through the v2-only command", async () => {
    const context = await setupLegacyFrame();

    const response = await requestFrameValidate(
      context.workspace.sId,
      context.token,
      context.sourcePath
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message:
          "Pre-publish validation is only available for Frames v2 manifests.",
      },
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("returns the existing Frame share link without changing use rights", async () => {
    const context = await setup();
    assert(context.frame);
    await context.frame.markFrameV2AsReadyFromMount(context.auth);
    await context.frame.setShareScope(context.auth, "emails_only");
    const before = await context.frame.getShareInfo();
    assert(before);
    const sourceDirectoryPath = context.manifestPath.replace(
      `/${FRAME_MANIFEST_FILE}`,
      ""
    );

    const response = await requestFrameShare(
      context.workspace.sId,
      context.token,
      sourceDirectoryPath
    );

    const shared = await response.json();
    expect(response.status, JSON.stringify(shared)).toBe(200);
    expect(shared).toEqual({
      frameId: context.frame.sId,
      shareScope: "emails_only",
      shareUrl: before.shareUrl,
      sourceDirectoryPath,
    });
    expect(await context.frame.getShareInfo()).toEqual(before);
  });

  it("does not create sharing state when retrieving an unshared Frame", async () => {
    const context = await setup();
    assert(context.frame);

    const response = await requestFrameShare(
      context.workspace.sId,
      context.token,
      context.manifestPath.replace(`/${FRAME_MANIFEST_FILE}`, "")
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining("Configure sharing in the Dust UI"),
      },
    });
    expect(await context.frame.getShareInfo()).toBeNull();
  });

  it("does not expose the former mutating Frame sharing API", async () => {
    const context = await setup();

    const response = await honoApp.request(
      `/api/v1/w/${context.workspace.sId}/sandbox/frames/share`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${context.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          emails: [context.auth.getNonNullableUser().email],
          shareScope: "public",
          sourceDirectoryPath: context.manifestPath.replace(
            `/${FRAME_MANIFEST_FILE}`,
            ""
          ),
        }),
      }
    );

    expect(response.status).toBe(401);
    expect(await context.frame?.getShareInfo()).toBeNull();
  });

  it("retrieves a Frame share link with read access to the source folder", async () => {
    const context = await setup();
    const pod = await SpaceFactory.project(context.workspace);
    const { globalGroup } = await GroupFactory.defaults(context.workspace);
    await SpaceFactory.attachGroup(pod, globalGroup, "project_viewer");
    await ConversationModel.update(
      { spaceId: pod.id },
      { where: { id: context.conversation.id } }
    );
    const frame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: context.workspace.sId,
        podId: pod.sId,
      })}Status/${FRAME_MANIFEST_FILE}`,
    });
    await frame.markFrameV2AsReadyFromMount(context.auth);

    const response = await requestFrameShare(
      context.workspace.sId,
      context.token,
      `pod-${pod.sId}/Status`
    );

    expect(response.status).toBe(200);
  });

  it("refuses share-link retrieval without the feature flag", async () => {
    const context = await createSandboxTokenTestContext();

    const response = await requestFrameShare(
      context.workspace.sId,
      context.token,
      `conversation-${context.conversation.sId}/Status`
    );

    expect(response.status).toBe(403);
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
