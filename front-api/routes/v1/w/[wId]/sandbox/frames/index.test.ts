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

// Frame UI type checking needs a sandbox and the Viz runtime types artifact; neither exists here.
vi.mock("@app/lib/api/viz/frame_runtime_types", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/viz/frame_runtime_types")
    >();
  return {
    ...actual,
    getFrameRuntimeTypesArtifact: vi.fn().mockResolvedValue(null),
  };
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
