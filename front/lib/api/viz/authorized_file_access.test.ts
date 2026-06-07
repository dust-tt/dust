import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  assertVizFileAuthorized,
  diffAuthorizedFileRefs,
  ensureAuthorizedFileAccessForShare,
  fetchShareableFileAllowlistState,
  formatPublicShareReferencedFilesChangeNoticeForLLM,
  readAllowlistedScopedVizFile,
  reverifyAuthorAccess,
} from "@app/lib/api/viz/authorized_file_access";
import {
  computeFrameContentHash,
  isAllowlistShareScopeStale,
  isAllowlistStale,
  isAuthorizedFileRef,
  resolveAllowlistedCanonicalPath,
} from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import { AuthorizedFileAccessModel } from "@app/lib/resources/storage/models/files";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  type AuthorizedFileAccessAllowlist,
  frameContentType,
  isUnverifiableFrameFileRefsShareError,
} from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
});

function makeAllowlist(
  overrides: Partial<AuthorizedFileAccessAllowlist> = {}
): AuthorizedFileAccessAllowlist {
  return {
    computedByUserId: "usr_test",
    frameContentHash: "hash",
    refs: [],
    ...overrides,
  };
}

describe("computeFrameContentHash", () => {
  it("returns a stable FNV-1a hex digest", () => {
    expect(computeFrameContentHash("hello")).toBe("a430d84680aabd0b");
    expect(computeFrameContentHash("hello")).toBe(
      computeFrameContentHash("hello")
    );
    expect(computeFrameContentHash("hello")).not.toBe(
      computeFrameContentHash("hello world")
    );
  });
});

describe("isAllowlistStale", () => {
  it("detects when frame content changed", () => {
    const content = "export default function Frame() {}";
    const allowlist = makeAllowlist({
      frameContentHash: computeFrameContentHash(content),
    });

    expect(isAllowlistStale(allowlist, content)).toBe(false);
    expect(isAllowlistStale(allowlist, `${content}// edited`)).toBe(true);
  });
});

describe("isAllowlistShareScopeStale", () => {
  it("detects when share scope changed", () => {
    expect(isAllowlistShareScopeStale("workspace", "workspace")).toBe(false);
    expect(isAllowlistShareScopeStale("workspace", "public")).toBe(true);
    expect(isAllowlistShareScopeStale("emails_only", "public")).toBe(true);
  });
});

describe("isAuthorizedFileRef", () => {
  it("matches file_id refs", () => {
    const allowlist = makeAllowlist({
      refs: [{ kind: "file_id", ref: "fil_ABCDEFGHIJ" }],
    });

    expect(isAuthorizedFileRef(allowlist, "fil_ABCDEFGHIJ")).toBe(true);
    expect(isAuthorizedFileRef(allowlist, "fil_OTHERFILE1")).toBe(false);
  });

  it("matches canonical_path refs and legacyPath aliases", () => {
    const allowlist = makeAllowlist({
      refs: [
        {
          kind: "canonical_path",
          ref: "conversation-conv_123/report.csv",
          legacyPath: "conversation/report.csv",
        },
      ],
    });

    expect(
      isAuthorizedFileRef(allowlist, "conversation-conv_123/report.csv")
    ).toBe(true);
    expect(isAuthorizedFileRef(allowlist, "conversation/report.csv")).toBe(
      true
    );
    expect(isAuthorizedFileRef(allowlist, "conversation/other.csv")).toBe(
      false
    );
  });

  it("matches project/ requests against pod/ legacy aliases", () => {
    const allowlist = makeAllowlist({
      refs: [
        {
          kind: "canonical_path",
          ref: "pod-pod_456/data.csv",
          legacyPath: "pod/data.csv",
        },
      ],
    });

    expect(isAuthorizedFileRef(allowlist, "project/data.csv")).toBe(true);
    expect(isAuthorizedFileRef(allowlist, "pod/data.csv")).toBe(true);
  });
});

describe("computeAuthorizedFileAccess", () => {
  it("records verified fil_ refs and inaccessible refs as unverifiable", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const accessibleFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const frameContent = `
      export default function Frame() {
        const data = useFile("${accessibleFile.sId}");
        const missing = useFile("fil_ZZZZZZZZZZ");
        return data;
      }
    `;

    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const result = await frameFile.computeAuthorizedFileAccess(auth, {
      frameContent,
    });

    expect(result.refs).toEqual([
      {
        kind: "file_id",
        ref: accessibleFile.sId,
        fileName: "data.txt",
      },
    ]);
    expect(result.unverifiableRefs).toEqual(["fil_ZZZZZZZZZZ"]);
    expect(result.computedByUserId).toBe(auth.user()!.sId);
    expect(result.frameContentHash).toBe(computeFrameContentHash(frameContent));
  });

  it("stores canonical paths and legacy aliases from scoped refs", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const canonicalPath = `conversation-${conversation.sId}/report.csv`;
    const frameContent = `useFile("${canonicalPath}"); useFile("conversation/report.csv");`;

    const mockFs = {
      stat: vi.fn().mockResolvedValue(
        new Ok({
          contentType: "text/csv",
          sizeBytes: 12,
          isDirectory: false,
        })
      ),
      read: vi.fn(),
    };

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs as unknown as DustFileSystem)
    );

    const result = await frameFile.computeAuthorizedFileAccess(auth, {
      frameContent,
    });

    expect(result.refs).toEqual(
      expect.arrayContaining([
        {
          kind: "canonical_path",
          ref: canonicalPath,
          fileName: "report.csv",
        },
        {
          kind: "canonical_path",
          ref: canonicalPath,
          legacyPath: "conversation/report.csv",
          fileName: "report.csv",
        },
      ])
    );
    expect(result.unverifiableRefs).toBeUndefined();
  });

  it("merges refs from nested frame imports", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const nestedDataFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "nested.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const nestedFrame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Nested.tsx",
      fileSize: 50,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const parentFrame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Parent.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const parentContent = `useFile("${nestedFrame.sId}");`;
    const nestedContent = `useFile("${nestedDataFile.sId}");`;

    vi.spyOn(FileResource, "fetchById").mockImplementation(
      async (_auth, id: string) => {
        if (id === nestedFrame.sId) {
          return nestedFrame;
        }
        if (id === nestedDataFile.sId) {
          return nestedDataFile;
        }
        return null;
      }
    );

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockImplementation(
      function getSharedReadStream(this: FileResource) {
        const content =
          this.sId === nestedFrame.sId ? nestedContent : "not-frame";
        return Readable.from([Buffer.from(content, "utf-8")]);
      }
    );

    const result = await parentFrame.computeAuthorizedFileAccess(auth, {
      frameContent: parentContent,
    });

    expect(result.refs).toEqual(
      expect.arrayContaining([
        {
          kind: "file_id",
          ref: nestedFrame.sId,
          fileName: "Nested.tsx",
        },
        {
          kind: "file_id",
          ref: nestedDataFile.sId,
          fileName: "nested.txt",
        },
      ])
    );
    expect(result.unverifiableRefs).toBeUndefined();
  });

  it("verifies pod-scoped refs for project-scoped frames", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const project = await SpaceFactory.project(auth.getNonNullableWorkspace());

    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: project.sId },
    });

    const frameContent = `useFile("project/report.csv");`;

    const mockFs = {
      stat: vi.fn().mockResolvedValue(
        new Ok({
          contentType: "text/csv",
          sizeBytes: 12,
          isDirectory: false,
        })
      ),
      read: vi.fn(),
    };

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs as unknown as DustFileSystem)
    );

    const result = await frameFile.computeAuthorizedFileAccess(auth, {
      frameContent,
    });

    expect(result.refs).toEqual([
      {
        kind: "canonical_path",
        ref: `pod-${project.sId}/report.csv`,
        legacyPath: "project/report.csv",
        fileName: "report.csv",
      },
    ]);
  });
});

describe("ensureAuthorizedFileAccessForShare", () => {
  it("blocks sharing when static refs cannot be verified", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from('useFile("fil_ZZZZZZZZZZ");', "utf-8")])
    );
    vi.spyOn(FileResource, "fetchById").mockResolvedValue(null);

    const result = await ensureAuthorizedFileAccessForShare(auth, frameFile);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(isUnverifiableFrameFileRefsShareError(result.error)).toBe(true);
      if (isUnverifiableFrameFileRefsShareError(result.error)) {
        expect(result.error.unverifiableRefs).toEqual(["fil_ZZZZZZZZZZ"]);
      }
    }

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
    });
    const rows = await AuthorizedFileAccessModel.findAll({
      where: {
        shareableFileId: shareableFile!.id,
        workspaceId: frameFile.workspaceId,
        revokedAt: null,
      },
    });
    expect(rows).toHaveLength(0);
  });

  it("recomputes when share scope changed but frame content is unchanged", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const dataFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const frameContent = `useFile("${dataFile.sId}");`;
    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
    });
    expect(shareableFile).not.toBeNull();
    const initialShareScope = shareableFile!.shareScope;

    await AuthorizedFileAccessModel.create({
      workspaceId: frameFile.workspaceId,
      shareableFileId: shareableFile!.id,
      kind: "file_id",
      ref: dataFile.sId,
      fileName: "data.txt",
      legacyPath: null,
      shareScope: initialShareScope,
      computedByUserId: auth.user()!.sId,
      frameContentHash: computeFrameContentHash(frameContent),
      allowedAt: new Date(),
      revokedAt: null,
    });

    await frameFile.setShareScope(auth, "public");

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from(frameContent, "utf-8")])
    );

    const result = await ensureAuthorizedFileAccessForShare(auth, frameFile);

    expect(result.isOk()).toBe(true);

    const rows = await AuthorizedFileAccessModel.findAll({
      where: {
        shareableFileId: shareableFile!.id,
        workspaceId: frameFile.workspaceId,
        revokedAt: null,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shareScope).toBe("public");
    expect(rows[0]?.ref).toBe(dataFile.sId);
    expect(rows[0]?.frameContentHash).toBe(
      computeFrameContentHash(frameContent)
    );
  });

  it("skips recompute when the active allowlist matches current content", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const frameContent = "export default function Frame() {}";
    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const activeSnapshot = makeAllowlist({
      computedByUserId: auth.user()!.sId,
      frameContentHash: computeFrameContentHash(frameContent),
      refs: [],
    });

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
    });
    expect(shareableFile).not.toBeNull();
    await AuthorizedFileAccessModel.create({
      workspaceId: frameFile.workspaceId,
      shareableFileId: shareableFile!.id,
      kind: "file_id",
      ref: "fil_PLACEHOLDER",
      fileName: null,
      legacyPath: null,
      shareScope: shareableFile!.shareScope,
      computedByUserId: activeSnapshot.computedByUserId,
      frameContentHash: activeSnapshot.frameContentHash,
      allowedAt: new Date(),
      revokedAt: null,
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from(frameContent, "utf-8")])
    );

    const result = await ensureAuthorizedFileAccessForShare(auth, frameFile);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.frameContentHash).toBe(
        activeSnapshot.frameContentHash
      );
      expect(result.value.computedByUserId).toBe(
        activeSnapshot.computedByUserId
      );
    }

    const rows = await AuthorizedFileAccessModel.findAll({
      where: {
        shareableFileId: shareableFile!.id,
        workspaceId: frameFile.workspaceId,
        revokedAt: null,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ref).toBe("fil_PLACEHOLDER");
  });

  it("recomputes and blocks when the active allowlist is stale", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const frameContent = 'useFile("fil_ABCDEFGHIJ");';
    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
    });
    expect(shareableFile).not.toBeNull();
    await AuthorizedFileAccessModel.create({
      workspaceId: frameFile.workspaceId,
      shareableFileId: shareableFile!.id,
      kind: "file_id",
      ref: "fil_OLDREF0001",
      fileName: null,
      legacyPath: null,
      shareScope: shareableFile!.shareScope,
      computedByUserId: auth.user()!.sId,
      frameContentHash: "stale-hash",
      allowedAt: new Date(),
      revokedAt: null,
    });

    vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
      Readable.from([Buffer.from(frameContent, "utf-8")])
    );
    vi.spyOn(FileResource, "fetchById").mockResolvedValue(null);

    const result = await ensureAuthorizedFileAccessForShare(auth, frameFile);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(isUnverifiableFrameFileRefsShareError(result.error)).toBe(true);
    }

    const rows = await AuthorizedFileAccessModel.findAll({
      where: {
        shareableFileId: shareableFile!.id,
        workspaceId: frameFile.workspaceId,
        revokedAt: null,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ref).toBe("fil_OLDREF0001");
  });
});

describe("resolveAllowlistedCanonicalPath", () => {
  it("returns the stored canonical ref for direct and legacy aliases", () => {
    const allowlist = makeAllowlist({
      refs: [
        {
          kind: "canonical_path",
          ref: "conversation-conv_123/chart.png",
          legacyPath: "conversation/chart.png",
        },
      ],
    });

    expect(
      resolveAllowlistedCanonicalPath(
        allowlist,
        "conversation-conv_123/chart.png"
      )
    ).toBe("conversation-conv_123/chart.png");
    expect(
      resolveAllowlistedCanonicalPath(allowlist, "conversation/chart.png")
    ).toBe("conversation-conv_123/chart.png");
    expect(
      resolveAllowlistedCanonicalPath(allowlist, "conversation/other.png")
    ).toBeNull();
  });
});

describe("readAllowlistedScopedVizFile", () => {
  it("reads via the authoring user's scoped file system", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const canonicalPath = "pod-vlt_otherPod/chart.png";
    const allowlist = makeAllowlist({
      computedByUserId: auth.user()!.sId,
      refs: [
        { kind: "canonical_path", ref: canonicalPath, fileName: "chart.png" },
      ],
    });

    const mockFs = {
      stat: vi
        .fn()
        .mockResolvedValue(
          new Ok({ contentType: "image/png", sizeBytes: 100 })
        ),
      read: vi.fn().mockResolvedValue(new Ok(Readable.from(["png-bytes"]))),
    };

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs as unknown as DustFileSystem)
    );

    const result = await readAllowlistedScopedVizFile({
      authorizedFileAccess: allowlist,
      canonicalScopedPath: canonicalPath,
      workspace,
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.contentType).toBe("image/png");
    expect(mockFs.stat).toHaveBeenCalledWith(canonicalPath);
    expect(mockFs.read).toHaveBeenCalledWith(canonicalPath);
  });
});

describe("assertVizFileAuthorized", () => {
  it("returns denied when the allowlist is empty or missing", async () => {
    const { workspace } = await createResourceTest({});

    expect(
      await assertVizFileAuthorized({
        authorizedFileAccess: null,
        requestedRef: "fil_ABCDEFGHIJ",
        owner: workspace,
        frameContent: "export default function Frame() {}",
      })
    ).toBe("denied");

    expect(
      await assertVizFileAuthorized({
        authorizedFileAccess: makeAllowlist({ refs: [] }),
        requestedRef: "fil_ABCDEFGHIJ",
        owner: workspace,
        frameContent: "export default function Frame() {}",
      })
    ).toBe("denied");
  });

  it("returns denied when frame content changed since the allowlist was computed", async () => {
    const { workspace } = await createResourceTest({});

    const frameContent = 'useFile("fil_ALLOWED01");';
    const allowlist = makeAllowlist({
      frameContentHash: computeFrameContentHash(frameContent),
      refs: [{ kind: "file_id", ref: "fil_ALLOWED01" }],
    });

    expect(
      await assertVizFileAuthorized({
        authorizedFileAccess: allowlist,
        requestedRef: "fil_ALLOWED01",
        owner: workspace,
        frameContent: `${frameContent}// edited`,
      })
    ).toBe("denied");
  });

  it("returns denied when the ref is not allowlisted", async () => {
    const { workspace } = await createResourceTest({});

    const frameContent = 'useFile("fil_ALLOWED01");';
    const allowlist = makeAllowlist({
      frameContentHash: computeFrameContentHash(frameContent),
      refs: [{ kind: "file_id", ref: "fil_ALLOWED01" }],
    });

    expect(
      await assertVizFileAuthorized({
        authorizedFileAccess: allowlist,
        requestedRef: "fil_DENIED0001",
        owner: workspace,
        frameContent,
      })
    ).toBe("denied");
  });

  it("returns authorized when the ref is allowlisted and author still has access", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const dataFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const frameContent = `useFile("${dataFile.sId}");`;
    const allowlist = makeAllowlist({
      computedByUserId: auth.user()!.sId,
      frameContentHash: computeFrameContentHash(frameContent),
      refs: [{ kind: "file_id", ref: dataFile.sId, fileName: "data.txt" }],
    });

    expect(
      await assertVizFileAuthorized({
        authorizedFileAccess: allowlist,
        requestedRef: dataFile.sId,
        owner: workspace,
        frameContent,
      })
    ).toBe("authorized");
  });
});

describe("reverifyAuthorAccess", () => {
  it("re-checks author access for an allowlisted ref", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const dataFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const allowlist = makeAllowlist({
      computedByUserId: auth.user()!.sId,
      refs: [{ kind: "file_id", ref: dataFile.sId, fileName: "data.txt" }],
    });

    const allowed = await reverifyAuthorAccess(
      allowlist,
      dataFile.sId,
      workspace
    );
    expect(allowed).toBe(true);

    const denied = await reverifyAuthorAccess(
      allowlist,
      "fil_NOTALLOWED1",
      workspace
    );
    expect(denied).toBe(false);
  });

  it("re-checks scoped path access via DustFileSystem", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const canonicalPath = `conversation-${conversation.sId}/report.csv`;
    const allowlist = makeAllowlist({
      computedByUserId: auth.user()!.sId,
      refs: [
        {
          kind: "canonical_path",
          ref: canonicalPath,
          legacyPath: "conversation/report.csv",
          fileName: "report.csv",
        },
      ],
    });

    const mockFs = {
      stat: vi.fn().mockResolvedValue(
        new Ok({
          contentType: "text/csv",
          sizeBytes: 12,
          isDirectory: false,
        })
      ),
      read: vi.fn(),
    };

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok(mockFs as unknown as DustFileSystem)
    );

    expect(
      await reverifyAuthorAccess(
        allowlist,
        "conversation/report.csv",
        workspace
      )
    ).toBe(true);

    mockFs.stat.mockResolvedValue(new Ok(null));
    expect(
      await reverifyAuthorAccess(
        allowlist,
        "conversation/report.csv",
        workspace
      )
    ).toBe(false);
  });
});

describe("public share referenced files change notice", () => {
  it("diffAuthorizedFileRefs reports added and removed refs", () => {
    const previous = [
      { kind: "file_id" as const, ref: "fil_OLD0000001", fileName: "old.txt" },
    ];
    const next = [
      { kind: "file_id" as const, ref: "fil_NEW0000001", fileName: "new.txt" },
      {
        kind: "canonical_path" as const,
        ref: "conversation-conv_123/report.csv",
        fileName: "report.csv",
      },
    ];

    expect(diffAuthorizedFileRefs(previous, next)).toEqual({
      added: [
        { kind: "file_id", ref: "fil_NEW0000001", fileName: "new.txt" },
        {
          kind: "canonical_path",
          ref: "conversation-conv_123/report.csv",
          fileName: "report.csv",
        },
      ],
      removed: [
        { kind: "file_id", ref: "fil_OLD0000001", fileName: "old.txt" },
      ],
    });
  });

  it("formats a notice when new references are added", () => {
    const notice = formatPublicShareReferencedFilesChangeNoticeForLLM([
      { kind: "file_id", ref: "fil_NEW0000001", fileName: "data.txt" },
    ]);

    expect(notice).toContain("Public share notice");
    expect(notice).toContain("Let the user know");
    expect(notice).toContain("New references: data.txt");
  });

  it("returns null when references are only removed", () => {
    expect(formatPublicShareReferencedFilesChangeNoticeForLLM([])).toBeNull();
  });

  it("fetchShareableFileAllowlistState returns the active allowlist refs", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const dataFile = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "data.txt",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const frameFile = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    await frameFile.setShareScope(auth, "public");

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: frameFile.id, workspaceId: frameFile.workspaceId },
    });
    expect(shareableFile).not.toBeNull();
    await AuthorizedFileAccessModel.create({
      workspaceId: frameFile.workspaceId,
      shareableFileId: shareableFile!.id,
      kind: "file_id",
      ref: dataFile.sId,
      fileName: "data.txt",
      legacyPath: null,
      shareScope: shareableFile!.shareScope,
      computedByUserId: auth.user()!.sId,
      frameContentHash: "hash",
      allowedAt: new Date(),
      revokedAt: null,
    });

    const state = await fetchShareableFileAllowlistState(frameFile);

    expect(state).toEqual({
      shareScope: "public",
      refs: [
        {
          kind: "file_id",
          ref: dataFile.sId,
          fileName: "data.txt",
        },
      ],
    });
  });
});
