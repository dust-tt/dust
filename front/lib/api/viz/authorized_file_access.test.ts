import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { reverifyAuthorAccess } from "@app/lib/api/viz/authorized_file_access";
import {
  computeFrameContentHash,
  isAllowlistStale,
  isAuthorizedFileRef,
} from "@app/lib/api/viz/authorized_file_access_policy";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  type AuthorizedFileAccessAllowlist,
  frameContentType,
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
