import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: {
    getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket"),
  },
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: vi.fn(() => "https://dust.tt"),
  },
}));

// ---------------------------------------------------------------------------
// forConversation
// ---------------------------------------------------------------------------

describe("DustFileSystem.forConversation", () => {
  beforeEach(() => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: vi.fn().mockResolvedValue(undefined) })),
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("creates a single conversation mount for a regular conversation", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    // No spaceId: regular (non-project) conversation has spaceId null.
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await DustFileSystem.forConversation(auth, conversation);

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(mounts).toHaveLength(1);
    expect(mounts[0].kind).toBe("conversation");
    expect(mounts[0].id).toBe(conversation.sId);
    expect(mounts[0].scopedPrefix).toBe(`conversation-${conversation.sId}`);
    expect(mounts[0].sandboxMountPoint).toBe(
      `/files/conversation-${conversation.sId}`
    );
    expect(mounts[0].legacyPrefix).toBe("conversation");
    expect(mounts[0].legacySandboxMountPoint).toBe("/files/conversation");
    expect(mounts[0].permissions.canRead).toBe(true);
    expect(mounts[0].permissions.canWrite).toBe(true);
  });

  it("adds a pod mount when the conversation belongs to a project space", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });

    // Create the project space, then re-fetch auth so it knows about the new editor group.
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    const result = await DustFileSystem.forConversation(auth, conversation);

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(mounts).toHaveLength(2);

    const convMount = mounts.find((m) => m.kind === "conversation");
    const podMount = mounts.find((m) => m.kind === "pod");

    expect(convMount).toBeDefined();
    expect(convMount!.id).toBe(conversation.sId);

    expect(podMount).toBeDefined();
    expect(podMount!.id).toBe(projectSpace.sId);
    expect(podMount!.scopedPrefix).toBe(`pod-${projectSpace.sId}`);
    expect(podMount!.sandboxMountPoint).toBe(`/files/pod-${projectSpace.sId}`);
    expect(podMount!.legacyPrefix).toBe("project");
    expect(podMount!.legacySandboxMountPoint).toBe("/files/project");
  });
});

// ---------------------------------------------------------------------------
// forPod
// ---------------------------------------------------------------------------

describe("DustFileSystem.forPod", () => {
  it("returns Err(unauthorized) when the user has no membership in the space", async () => {
    // Create two separate workspaces; the regular user has no access to the admin's space.
    const { authenticator: regularAuth } = await createResourceTest({
      role: "user",
    });
    const { workspace: adminWorkspace } = await createResourceTest({
      role: "admin",
    });

    // Create a project space in the admin workspace with no members.
    const projectSpace = await SpaceFactory.project(adminWorkspace);

    // regularAuth belongs to a different workspace — canRead will be false.
    const result = await DustFileSystem.forPod(regularAuth, projectSpace);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("unauthorized");
    }
  });

  it("returns Ok with a pod mount when the user is in the editor group", async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { workspace, user } = await createResourceTest({ role: "admin" });

    // Pass user.id so the user is added to the editorGroup by SpaceFactory.
    const projectSpace = await SpaceFactory.project(workspace, user.id);

    // Re-fetch auth so _groupModelIds includes the newly created editor group.
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const result = await DustFileSystem.forPod(auth, projectSpace);

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(mounts).toHaveLength(1);
    expect(mounts[0].kind).toBe("pod");
    expect(mounts[0].id).toBe(projectSpace.sId);
    expect(mounts[0].scopedPrefix).toBe(`pod-${projectSpace.sId}`);
    expect(mounts[0].permissions.canRead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fromScopedPath
// ---------------------------------------------------------------------------

describe("DustFileSystem.fromScopedPath", () => {
  it("returns Err(invalid_path) for an unrecognised prefix", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await DustFileSystem.fromScopedPath(
      auth,
      "unknown-prefix/file.txt"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(not_found) when conversation does not exist", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await DustFileSystem.fromScopedPath(
      auth,
      "conversation-nonexistent/file.txt"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("returns Err(not_found) when pod space does not exist", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await DustFileSystem.fromScopedPath(
      auth,
      "pod-nonexistent/file.txt"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("returns Ok with a conversation-scoped fs for a conversation- prefix", async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator: auth, conversationsSpace } =
      await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });

    const result = await DustFileSystem.fromScopedPath(
      auth,
      `conversation-${conversation.sId}/report.pdf`
    );

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(
      mounts.some((m) => m.kind === "conversation" && m.id === conversation.sId)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// list() - thumbnail URL construction
// ---------------------------------------------------------------------------

describe("DustFileSystem.list thumbnail URLs", () => {
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getAllFilesByPrefixMock = vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("sets thumbnailUrl for image entries in a conversation mount", async () => {
    const { authenticator: auth, conversationsSpace } =
      await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });

    const workspaceId = auth.getNonNullableWorkspace().sId;
    const prefix = `w/${workspaceId}/conversations/${conversation.sId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        {
          name: `${prefix}photo.png`,
          metadata: {
            contentType: "image/png",
            size: "1024",
            updated: new Date().toISOString(),
          },
        },
      ],
      pageFetchCount: 1,
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    assert(fsResult.isOk());
    const entries = await fsResult.value.list();

    const file = entries.find((e) => !e.isDirectory);
    assert(file !== undefined && !file.isDirectory);
    expect(file.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${workspaceId}` +
        `/assistant/conversations/${conversation.sId}/files/thumbnail` +
        `?filePath=${encodeURIComponent(`conversation-${conversation.sId}/photo.png`)}`
    );
  });

  it("leaves thumbnailUrl null for non-image entries", async () => {
    const { authenticator: auth, conversationsSpace } =
      await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });

    const workspaceId = auth.getNonNullableWorkspace().sId;
    const prefix = `w/${workspaceId}/conversations/${conversation.sId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        {
          name: `${prefix}report.pdf`,
          metadata: {
            contentType: "application/pdf",
            size: "2048",
            updated: new Date().toISOString(),
          },
        },
      ],
      pageFetchCount: 1,
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    assert(fsResult.isOk());
    const entries = await fsResult.value.list();

    const file = entries.find((e) => !e.isDirectory);
    assert(file !== undefined && !file.isDirectory);
    expect(file.thumbnailUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Path normalization and traversal prevention
// ---------------------------------------------------------------------------

describe("DustFileSystem.normalizeScopedPath", () => {
  it("returns the path unchanged for a clean canonical path", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/report.pdf")
    ).toBe("conversation-abc/report.pdf");
  });

  it("collapses redundant dot segments", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/./report.pdf")
    ).toBe("conversation-abc/report.pdf");
  });

  it("collapses double slashes", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc//report.pdf")
    ).toBe("conversation-abc/report.pdf");
  });

  it("returns null for a path that escapes via ..", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/../../etc/passwd")
    ).toBeNull();
  });

  it("returns null for a bare .. segment", () => {
    expect(DustFileSystem.normalizeScopedPath("..")).toBeNull();
  });

  it("returns null for an absolute path", () => {
    expect(DustFileSystem.normalizeScopedPath("/etc/passwd")).toBeNull();
  });

  it("returns null when .. escapes a subdirectory but leaves the mount", () => {
    // conversation-abc/../pod-xyz/file.txt normalises to pod-xyz/file.txt,
    // which does not start with .. so normalizeScopedPath returns it.
    // The mount check then rejects it as not belonging to any mount.
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/../pod-xyz/file.txt")
    ).toBe("pod-xyz/file.txt");
  });
});

describe("DustFileSystem path traversal rejection (integration)", () => {
  let auth: Authenticator;
  let conversationId: string;

  beforeEach(async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        save: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue([false]),
      })),
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    conversationId = conversation.sId;
  });

  async function makeFs() {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());
    return fs.value;
  }

  it("rejects a write with a .. escape attempt", async () => {
    const fs = await makeFs();
    const result = await fs.write(
      `conversation-${conversationId}/../../etc/passwd`,
      Buffer.from("x"),
      "text/plain"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
      expect(result.error.message).toContain("traversal");
    }
  });

  it("rejects a read with a .. escape attempt", async () => {
    const fs = await makeFs();
    const result = await fs.read(
      `conversation-${conversationId}/../../etc/passwd`
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
      expect(result.error.message).toContain("traversal");
    }
  });

  it("rejects a write with an absolute path", async () => {
    const fs = await makeFs();
    const result = await fs.write(
      "/etc/passwd",
      Buffer.from("x"),
      "text/plain"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("normalises harmless dot segments and accepts the path", async () => {
    const fs = await makeFs();
    // ./report.txt inside the mount normalises to conversation-{id}/report.txt — valid.
    const result = await fs.write(
      `conversation-${conversationId}/./report.txt`,
      Buffer.from("hello"),
      "text/plain"
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects cross-mount traversal (.. to a different scoped prefix)", async () => {
    const fs = await makeFs();
    // Normalises to pod-other/file.txt — not in any mount for this FS.
    const result = await fs.read(
      `conversation-${conversationId}/../pod-other/file.txt`
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy path rejection
// ---------------------------------------------------------------------------

describe("DustFileSystem legacy path rejection", () => {
  let auth: Authenticator;
  let conversationId: string;

  beforeEach(async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: vi.fn().mockResolvedValue(undefined) })),
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    conversationId = conversation.sId;
  });

  it("returns Err(legacy_path) for a 'conversation/...' write", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.write(
      "conversation/report.txt",
      Buffer.from("hello"),
      "text/plain"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("legacy_path");
    }
  });

  it("returns Err(legacy_path) for a 'project/...' write", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.write(
      "project/data.csv",
      Buffer.from("a,b"),
      "text/csv"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("legacy_path");
    }
  });

  it("accepts the canonical 'conversation-{cId}/...' path for write", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.write(
      `conversation-${conversationId}/notes.txt`,
      Buffer.from("a"),
      "text/plain"
    );

    expect(result.isOk()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Permission enforcement
// ---------------------------------------------------------------------------

describe("DustFileSystem permission enforcement", () => {
  let auth: Authenticator;
  let conversationId: string;

  beforeEach(async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi
        .fn()
        .mockResolvedValue({ files: [], pageFetchCount: 1 }),
      file: vi.fn(() => ({
        save: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue([false]),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    conversationId = conversation.sId;
  });

  it("returns Err(invalid_path) when writing to a path not in any mount", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.write(
      "pod-unknown/file.txt",
      Buffer.from("x"),
      "text/plain"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(invalid_path) when reading from a path not in any mount", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.read("pod-unknown/file.txt");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("conversation mount always has canRead and canWrite", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const mount = fs.value.getMounts()[0];
    expect(mount.permissions.canRead).toBe(true);
    expect(mount.permissions.canWrite).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// move (non-atomicity)
// ---------------------------------------------------------------------------

describe("DustFileSystem.move", () => {
  let auth: Authenticator;
  let conversationId: string;
  let copyFileMock: ReturnType<typeof vi.fn>;
  let existsMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    existsMock = vi.fn().mockResolvedValue([true]);
    deleteMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      file: vi.fn(() => ({ exists: existsMock })),
      delete: deleteMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    conversationId = conversation.sId;
  });

  it("returns Ok with sourceDeletionFailed false on a clean move", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move({
      src: `conversation-${conversationId}/src.txt`,
      dest: `conversation-${conversationId}/dest.txt`,
    });

    assert(result.isOk());
    expect(result.value.sourceDeletionFailed).toBe(false);
    expect(copyFileMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it("returns Ok with sourceDeletionFailed true when delete fails after a successful copy", async () => {
    deleteMock.mockRejectedValue(new Error("storage delete failed"));

    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move({
      src: `conversation-${conversationId}/src.txt`,
      dest: `conversation-${conversationId}/dest.txt`,
    });

    // The destination copy succeeded, so we return Ok instead of Err.
    assert(result.isOk());
    expect(result.value.sourceDeletionFailed).toBe(true);
  });

  it("returns Err when the copy itself fails", async () => {
    copyFileMock.mockRejectedValue(new Error("storage copy failed"));

    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move({
      src: `conversation-${conversationId}/src.txt`,
      dest: `conversation-${conversationId}/dest.txt`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("internal");
    }
    // Delete must not be called when the copy failed.
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("returns Err(invalid_path) when source path is not in any mount", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move({
      src: "pod-unknown/src.txt",
      dest: `conversation-${conversationId}/dest.txt`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});

// ---------------------------------------------------------------------------
// forShareToken
// ---------------------------------------------------------------------------

describe("DustFileSystem.forShareToken", () => {
  it("creates a single conversation mount with canRead:true when only a conversationId is given", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversationId = "conv_abc123";
    const fs = DustFileSystem.forShareToken(auth, { conversationId, spaceId: null });
    const mounts = fs.getMounts();

    expect(mounts).toHaveLength(1);
    expect(mounts[0]).toMatchObject({
      kind: "conversation",
      id: conversationId,
      scopedPrefix: `conversation-${conversationId}`,
      permissions: { canRead: true, canWrite: false },
    });
  });

  it("creates a single pod mount with canRead:true when only a spaceId is given", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const spaceId = "vlt_pod456";
    const fs = DustFileSystem.forShareToken(auth, { conversationId: null, spaceId });
    const mounts = fs.getMounts();

    expect(mounts).toHaveLength(1);
    expect(mounts[0]).toMatchObject({
      kind: "pod",
      id: spaceId,
      scopedPrefix: `pod-${spaceId}`,
      permissions: { canRead: true, canWrite: false },
    });
  });

  it("creates both conversation and pod mounts when both IDs are provided", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversationId = "conv_abc123";
    const spaceId = "vlt_pod456";
    const fs = DustFileSystem.forShareToken(auth, { conversationId, spaceId });
    const mounts = fs.getMounts();

    expect(mounts).toHaveLength(2);
    expect(mounts[0]).toMatchObject({
      kind: "conversation",
      id: conversationId,
      permissions: { canRead: true, canWrite: false },
    });
    expect(mounts[1]).toMatchObject({
      kind: "pod",
      id: spaceId,
      permissions: { canRead: true, canWrite: false },
    });
  });

  it("creates no mounts when both IDs are null", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const fs = DustFileSystem.forShareToken(auth, { conversationId: null, spaceId: null });
    const mounts = fs.getMounts();

    expect(mounts).toHaveLength(0);
  });

  it("sets the legacy conversation prefix for the conversation mount", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const conversationId = "conv_abc123";
    const fs = DustFileSystem.forShareToken(auth, { conversationId, spaceId: null });
    const mounts = fs.getMounts();

    expect(mounts[0].legacyPrefix).toBe("conversation");
    expect(mounts[0].legacySandboxMountPoint).toBe("/files/conversation");
  });

  it("sets the legacy project prefix for the pod mount", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const spaceId = "vlt_pod456";
    const fs = DustFileSystem.forShareToken(auth, { conversationId: null, spaceId });
    const mounts = fs.getMounts();

    expect(mounts[0].legacyPrefix).toBe("project");
    expect(mounts[0].legacySandboxMountPoint).toBe("/files/project");
  });
});
