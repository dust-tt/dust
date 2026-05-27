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
      getAllFilesByPrefix: vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
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
    expect(mounts[0].sandboxMountPoint).toBe(`/files/conversation-${conversation.sId}`);
    expect(mounts[0].legacyPrefix).toBe("conversation");
    expect(mounts[0].legacySandboxMountPoint).toBe("/files/conversation");
    expect(mounts[0].permissions.canRead).toBe(true);
    expect(mounts[0].permissions.canWrite).toBe(true);
  });

  it("adds a pod mount when the conversation belongs to a project space", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });

    // Create the project space, then re-fetch auth so it knows about the new editor group.
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);

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
    const { authenticator: regularAuth } = await createResourceTest({ role: "user" });
    const { workspace: adminWorkspace } = await createResourceTest({ role: "admin" });

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
      getAllFilesByPrefix: vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { workspace, user } = await createResourceTest({ role: "admin" });

    // Pass user.id so the user is added to the editorGroup by SpaceFactory.
    const projectSpace = await SpaceFactory.project(workspace, user.id);

    // Re-fetch auth so _groupModelIds includes the newly created editor group.
    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);

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
    const result = await DustFileSystem.fromScopedPath(auth, "unknown-prefix/file.txt");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(not_found) when conversation does not exist", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await DustFileSystem.fromScopedPath(auth, "conversation-nonexistent/file.txt");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("returns Err(not_found) when pod space does not exist", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const result = await DustFileSystem.fromScopedPath(auth, "pod-nonexistent/file.txt");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("returns Ok with a conversation-scoped fs for a conversation- prefix", async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator: auth, conversationsSpace } = await createResourceTest({});
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
    expect(mounts.some((m) => m.kind === "conversation" && m.id === conversation.sId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Legacy path canonicalization
// ---------------------------------------------------------------------------

describe("DustFileSystem legacy path compatibility", () => {
  let auth: Authenticator;
  let conversationId: string;
  let saveMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: saveMock })),
      getAllFilesByPrefix: vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
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

  it("accepts a legacy 'conversation/...' path for write", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.write(
      "conversation/report.txt",
      Buffer.from("hello"),
      "text/plain"
    );

    expect(result.isOk()).toBe(true);
    expect(saveMock).toHaveBeenCalledOnce();
  });

  it("treats legacy 'conversation/...' and canonical 'conversation-{cId}/...' as equivalent", async () => {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const legacyResult = await fs.value.write(
      "conversation/notes.txt",
      Buffer.from("a"),
      "text/plain"
    );
    const canonicalResult = await fs.value.write(
      `conversation-${conversationId}/notes.txt`,
      Buffer.from("a"),
      "text/plain"
    );

    expect(legacyResult.isOk()).toBe(true);
    expect(canonicalResult.isOk()).toBe(true);
    // Both writes should reach GCS.
    expect(saveMock).toHaveBeenCalledTimes(2);
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
      getAllFilesByPrefix: vi.fn().mockResolvedValue({ files: [], pageFetchCount: 1 }),
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

    const result = await fs.value.write("pod-unknown/file.txt", Buffer.from("x"), "text/plain");

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
    expect(result).toBeNull();
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

    const result = await fs.value.move(
      `conversation-${conversationId}/src.txt`,
      `conversation-${conversationId}/dest.txt`
    );

    assert(result.isOk());
    expect(result.value.sourceDeletionFailed).toBe(false);
    expect(copyFileMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it("returns Ok with sourceDeletionFailed true when delete fails after a successful copy", async () => {
    deleteMock.mockRejectedValue(new Error("GCS delete failed"));

    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move(
      `conversation-${conversationId}/src.txt`,
      `conversation-${conversationId}/dest.txt`
    );

    // The destination copy succeeded, so we return Ok instead of Err.
    assert(result.isOk());
    expect(result.value.sourceDeletionFailed).toBe(true);
  });

  it("returns Err when the copy itself fails", async () => {
    copyFileMock.mockRejectedValue(new Error("GCS copy failed"));

    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());

    const result = await fs.value.move(
      `conversation-${conversationId}/src.txt`,
      `conversation-${conversationId}/dest.txt`
    );

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

    const result = await fs.value.move(
      "pod-unknown/src.txt",
      `conversation-${conversationId}/dest.txt`
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });
});
