import {
  DustFileSystem,
  sanitizeFileSystemName,
} from "@app/lib/api/file_system/dust_file_system";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function sessionAuthForUser(
  user: UserResource,
  workspace: LightWorkspaceType
): Promise<Authenticator> {
  assert(
    user.workOSUserId,
    "Expected user to have a WorkOS user ID for session auth"
  );

  return Authenticator.fromSession(
    {
      type: "workos",
      sessionId: `test-session-${user.sId}`,
      user: {
        workOSUserId: user.workOSUserId,
        email: user.email ?? "user@dust.tt",
        email_verified: true,
        name: user.username ?? "user",
        nickname: user.username ?? "user",
      },
      authenticationMethod: "GoogleOAuth",
      isSSO: false,
      workspaceId: workspace.sId,
      organizationId: workspace.workOSOrganizationId ?? undefined,
      region: "us-central1",
    },
    workspace.sId
  );
}

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
    expect(podMount!.legacySandboxMountPoint).toBe("/files/pod");
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
// forAgentLoop
// ---------------------------------------------------------------------------

describe("DustFileSystem.forAgentLoop", () => {
  const defaultMockBucket = {
    file: vi.fn(() => ({ save: vi.fn().mockResolvedValue(undefined) })),
    getAllFilesByPrefix: vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 }),
  } as unknown as ReturnType<typeof getPrivateUploadBucket>;

  beforeEach(() => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue(defaultMockBucket);
  });

  it("matches forConversation mounts when scopedPaths is empty", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const [forConversation, forAgentLoop] = await Promise.all([
      DustFileSystem.forConversation(auth, conversation),
      DustFileSystem.forAgentLoop(auth, { conversation }),
    ]);

    assert(forConversation.isOk());
    assert(forAgentLoop.isOk());

    expect(forAgentLoop.value.getMounts()).toEqual(
      forConversation.value.getMounts()
    );
  });

  it("adds a second conversation mount when scopedPaths references another accessible conversation", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });

    const currentConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await DustFileSystem.forAgentLoop(auth, {
      conversation: currentConversation,
      scopedPaths: [
        `conversation-${otherConversation.sId}/report.pdf`,
        `conversation-${currentConversation.sId}/notes.txt`,
      ],
    });

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(mounts).toHaveLength(2);
    expect(
      mounts.some(
        (m) => m.kind === "conversation" && m.id === currentConversation.sId
      )
    ).toBe(true);
    expect(
      mounts.some(
        (m) => m.kind === "conversation" && m.id === otherConversation.sId
      )
    ).toBe(true);
  });

  it("returns Err(not_found) when scopedPaths references an inaccessible conversation", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });
    const { authenticator: otherAuth } = await createResourceTest({
      role: "user",
    });

    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const currentConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    const otherAgentConfig = await AgentConfigurationFactory.createTestAgent(
      otherAuth,
      { name: "Other Agent", description: "Other Agent" }
    );
    const privateConversation = await ConversationFactory.create(otherAuth, {
      agentConfigurationId: otherAgentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await DustFileSystem.forAgentLoop(auth, {
      conversation: currentConversation,
      scopedPaths: [`conversation-${privateConversation.sId}/secret.pdf`],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("adds a pod mount from scopedPaths even when the loop conversation is not in a pod", async () => {
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
    const regularConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await DustFileSystem.forAgentLoop(auth, {
      conversation: regularConversation,
      scopedPaths: [`pod-${projectSpace.sId}/shared.md`],
    });

    assert(result.isOk());
    const mounts = result.value.getMounts();
    expect(mounts).toHaveLength(2);
    expect(mounts.some((m) => m.kind === "conversation")).toBe(true);
    expect(
      mounts.some((m) => m.kind === "pod" && m.id === projectSpace.sId)
    ).toBe(true);
    const podMount = mounts.find((m) => m.kind === "pod");
    expect(podMount!.permissions.canRead).toBe(true);
  });

  it("returns Err(unauthorized) when scopedPaths references a pod the user cannot read", async () => {
    const { workspace, user } = await createResourceTest({ role: "user" });

    // Project space with no editor membership for `user`.
    const projectSpace = await SpaceFactory.project(workspace);
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
    });

    const result = await DustFileSystem.forAgentLoop(auth, {
      conversation,
      scopedPaths: [`pod-${projectSpace.sId}/data.csv`],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("unauthorized");
    }
  });

  it("accepts stat on a dest path in another conversation mount but not with forConversation alone", async () => {
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      ...defaultMockBucket,
      file: vi.fn(() => ({
        exists: vi.fn().mockResolvedValue([false]),
      })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });

    const currentConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const destPath = `conversation-${otherConversation.sId}/dest.txt`;

    const conversationOnlyFs = await DustFileSystem.forConversation(
      auth,
      currentConversation
    );
    assert(conversationOnlyFs.isOk());
    const conversationOnlyStat = await conversationOnlyFs.value.stat(destPath);
    expect(conversationOnlyStat.isErr()).toBe(true);
    if (conversationOnlyStat.isErr()) {
      expect(conversationOnlyStat.error.code).toBe("invalid_path");
    }

    const agentLoopFs = await DustFileSystem.forAgentLoop(auth, {
      conversation: currentConversation,
      scopedPaths: [destPath],
    });
    assert(agentLoopFs.isOk());
    const agentLoopStat = await agentLoopFs.value.stat(destPath);
    expect(agentLoopStat.isOk()).toBe(true);
    if (agentLoopStat.isOk()) {
      expect(agentLoopStat.value).toBe(null);
    }
  });

  it("deduplicates mounts when scopedPaths only reference the current conversation and pod", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });
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

    const result = await DustFileSystem.forAgentLoop(auth, {
      conversation,
      scopedPaths: [
        `conversation-${conversation.sId}/a.txt`,
        `pod-${projectSpace.sId}/b.txt`,
      ],
    });

    assert(result.isOk());
    expect(result.value.getMounts()).toHaveLength(2);
  });

  describe("access control", () => {
    beforeEach(async () => {
      vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      ).mockResolvedValue(new Ok(undefined));
    });

    it("returns Err(not_found) for another conversation when privateConversationUrlsByDefault is enabled and the user is not a participant", async () => {
      const {
        workspace,
        globalSpace,
        authenticator: adminAuth,
      } = await createResourceTest({ role: "admin" });

      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      const adminConversation = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        requestedSpaceIds: [globalSpace.id],
        messagesCreatedAt: [new Date()],
      });

      const updateResult = await WorkspaceResource.updateMetadata(
        workspace.id,
        { privateConversationUrlsByDefault: true }
      );
      assert(updateResult.isOk(), "Failed to enable private conversation URLs");

      const userSessionAuth = await sessionAuthForUser(regularUser, workspace);

      const access = await ConversationResource.canAccess(
        userSessionAuth,
        adminConversation.sId
      );
      expect(access).toBe(
        "conversation_access_restricted_by_private_by_default_url_restriction"
      );

      expect(
        await ConversationResource.fetchById(
          userSessionAuth,
          adminConversation.sId
        )
      ).toBeNull();

      const userAgentConfig = await AgentConfigurationFactory.createTestAgent(
        userSessionAuth,
        { name: "User Agent", description: "User Agent" }
      );
      const userConversation = await ConversationFactory.create(
        userSessionAuth,
        {
          agentConfigurationId: userAgentConfig.sId,
          messagesCreatedAt: [],
        }
      );

      const result = await DustFileSystem.forAgentLoop(userSessionAuth, {
        conversation: userConversation,
        scopedPaths: [`conversation-${adminConversation.sId}/secret.pdf`],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("not_found");
      }
    });

    it("adds a pod conversation mount when the user is a pod member", async () => {
      const {
        workspace,
        user,
        authenticator: adminAuth,
      } = await createResourceTest({ role: "admin" });

      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace, user.id);
      const addMemberResult = await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId, regularUser.sId],
      });
      assert(addMemberResult.isOk(), "Failed to add users to project space");

      const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      const refreshedUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      const podConversation = await ConversationFactory.create(
        refreshedAdminAuth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          requestedSpaceIds: [projectSpace.id],
          spaceId: projectSpace.id,
          messagesCreatedAt: [new Date()],
        }
      );

      const access = await ConversationResource.canAccess(
        refreshedUserAuth,
        podConversation.sId
      );
      expect(access).toBe("allowed");

      const userAgentConfig = await AgentConfigurationFactory.createTestAgent(
        refreshedUserAuth,
        { name: "User Agent", description: "User Agent" }
      );
      const userConversation = await ConversationFactory.create(
        refreshedUserAuth,
        {
          agentConfigurationId: userAgentConfig.sId,
          messagesCreatedAt: [],
        }
      );

      const result = await DustFileSystem.forAgentLoop(refreshedUserAuth, {
        conversation: userConversation,
        scopedPaths: [`conversation-${podConversation.sId}/shared.pdf`],
      });

      assert(result.isOk());
      expect(
        result.value
          .getMounts()
          .some(
            (m) => m.kind === "conversation" && m.id === podConversation.sId
          )
      ).toBe(true);
    });

    it("adds a pod conversation mount when the pod is open and the user is not a pod member", async () => {
      const {
        workspace,
        user,
        authenticator: adminAuth,
      } = await createResourceTest({ role: "admin" });

      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });
      const userSessionAuth = await sessionAuthForUser(regularUser, workspace);

      const openProjectRes = await createSpaceAndGroup(adminAuth, {
        name: `open pod ${Date.now()}`,
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });
      assert(
        openProjectRes.isOk(),
        openProjectRes.isErr()
          ? openProjectRes.error.message
          : "Failed to create open project"
      );
      const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const openProject = await SpaceResource.fetchById(
        refreshedAdminAuth,
        openProjectRes.value.sId
      );
      assert(openProject, "Open project not found after creation");
      expect(openProject.isOpen()).toBe(true);

      const podConversation = await ConversationFactory.create(
        refreshedAdminAuth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          requestedSpaceIds: [openProject.id],
          spaceId: openProject.id,
          messagesCreatedAt: [new Date()],
        }
      );

      const access = await ConversationResource.canAccess(
        userSessionAuth,
        podConversation.sId
      );
      expect(access).toBe("allowed");

      const userAgentConfig = await AgentConfigurationFactory.createTestAgent(
        userSessionAuth,
        { name: "User Agent", description: "User Agent" }
      );
      const userConversation = await ConversationFactory.create(
        userSessionAuth,
        {
          agentConfigurationId: userAgentConfig.sId,
          messagesCreatedAt: [],
        }
      );

      const result = await DustFileSystem.forAgentLoop(userSessionAuth, {
        conversation: userConversation,
        scopedPaths: [`conversation-${podConversation.sId}/open.pdf`],
      });

      assert(result.isOk());
      expect(
        result.value
          .getMounts()
          .some(
            (m) => m.kind === "conversation" && m.id === podConversation.sId
          )
      ).toBe(true);
    });

    it("returns Err(not_found) for a conversation in a restricted pod the user cannot access", async () => {
      const { workspace, user } = await createResourceTest({ role: "admin" });

      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });
      const userSessionAuth = await sessionAuthForUser(regularUser, workspace);

      const restrictedProject = await SpaceFactory.project(workspace, user.id);
      expect(restrictedProject.isOpen()).toBe(false);

      const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const podConversation = await ConversationFactory.create(
        refreshedAdminAuth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          requestedSpaceIds: [restrictedProject.id],
          spaceId: restrictedProject.id,
          messagesCreatedAt: [new Date()],
        }
      );

      const access = await ConversationResource.canAccess(
        userSessionAuth,
        podConversation.sId
      );
      expect(access).toBe("conversation_access_restricted");

      expect(
        await ConversationResource.fetchById(
          userSessionAuth,
          podConversation.sId
        )
      ).toBeNull();

      const userAgentConfig = await AgentConfigurationFactory.createTestAgent(
        userSessionAuth,
        { name: "User Agent", description: "User Agent" }
      );
      const userConversation = await ConversationFactory.create(
        userSessionAuth,
        {
          agentConfigurationId: userAgentConfig.sId,
          messagesCreatedAt: [],
        }
      );

      const result = await DustFileSystem.forAgentLoop(userSessionAuth, {
        conversation: userConversation,
        scopedPaths: [`conversation-${podConversation.sId}/restricted.pdf`],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("not_found");
      }
    });
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
    const updatedAt = new Date("2025-01-01T00:00:00.000Z");
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        {
          name: `${prefix}photo.png`,
          metadata: {
            contentType: "image/png",
            size: "1024",
            updated: updatedAt.toISOString(),
          },
        },
      ],
      pageFetchCount: 1,
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    assert(fsResult.isOk());
    const listResult = await fsResult.value.list();
    assert(listResult.isOk());

    const file = listResult.value.find((e) => !e.isDirectory);
    assert(file !== undefined && !file.isDirectory);
    expect(file.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${workspaceId}` +
        `/files/path/conversation-${conversation.sId}/photo.png?thumbnail=1&v=${updatedAt.getTime()}`
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
    const listResult = await fsResult.value.list();
    assert(listResult.isOk());

    const file = listResult.value.find((e) => !e.isDirectory);
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
  let fileExists: (filePath: string) => boolean;
  let deleteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    fileExists = (filePath: string) => filePath.endsWith("/src.txt");
    deleteMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      file: vi.fn((filePath: string) => ({
        exists: () => Promise.resolve([fileExists(filePath)]),
      })),
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

  it("returns Err(already_exists) when the destination file already exists", async () => {
    fileExists = (filePath: string) =>
      filePath.endsWith("/src.txt") || filePath.endsWith("/dest.txt");

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
      expect(result.error.code).toBe("already_exists");
    }
    expect(copyFileMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
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

describe("DustFileSystem.rename", () => {
  let auth: Authenticator;
  let conversationId: string;
  let copyFileMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    deleteMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      file: vi.fn((filePath: string) => ({
        exists: vi.fn().mockResolvedValue([filePath.endsWith("/report.pdf")]),
      })),
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

  async function makeFs() {
    const convRes = await ConversationResource.fetchById(auth, conversationId);
    assert(convRes !== null);
    const fs = await DustFileSystem.forConversation(auth, convRes.toJSON());
    assert(fs.isOk());
    return fs.value;
  }

  it("returns Ok with the new dest path on a successful rename", async () => {
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "summary.pdf"
    );

    assert(result.isOk());
    expect(result.value.dest).toBe(
      `conversation-${conversationId}/summary.pdf`
    );
    expect(result.value.sourceDeletionFailed).toBe(false);
    expect(copyFileMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it("is a no-op when the new filename matches the current one", async () => {
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "report.pdf"
    );

    assert(result.isOk());
    expect(result.value.dest).toBe(`conversation-${conversationId}/report.pdf`);
    expect(result.value.sourceDeletionFailed).toBe(false);
    // No GCS operations for a no-op.
    expect(copyFileMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("returns Err(invalid_path) for an empty filename", async () => {
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      ""
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(invalid_path) for a filename containing a forward slash", async () => {
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "sub/dir.pdf"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns Err(invalid_path) for a filename containing a backslash", async () => {
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "sub\\dir.pdf"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_path");
    }
  });

  it("returns sourceDeletionFailed true when delete fails after a successful copy", async () => {
    deleteMock.mockRejectedValue(new Error("storage delete failed"));
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "renamed.pdf"
    );

    assert(result.isOk());
    expect(result.value.sourceDeletionFailed).toBe(true);
    expect(result.value.dest).toBe(
      `conversation-${conversationId}/renamed.pdf`
    );
  });

  it("returns Err(internal) when the underlying copy fails", async () => {
    copyFileMock.mockRejectedValue(new Error("storage copy failed"));
    const fs = await makeFs();
    const result = await fs.rename(
      `conversation-${conversationId}/report.pdf`,
      "renamed.pdf"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("internal");
    }
    // Delete must not be called when the copy failed.
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("sanitizeFileSystemName", () => {
  it("leaves a plain ASCII name unchanged", () => {
    expect(sanitizeFileSystemName("quarterly-report.pdf")).toBe(
      "quarterly-report.pdf"
    );
  });

  it("strips leading control characters", () => {
    expect(sanitizeFileSystemName("\n\tsummary.txt")).toBe("summary.txt");
  });

  it("strips embedded control characters", () => {
    expect(sanitizeFileSystemName("my\x00file\x1Fname.txt")).toBe(
      "myfilename.txt"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFileSystemName("  notes.md  ")).toBe("notes.md");
  });

  it("preserves accented and non-ASCII printable characters", () => {
    const name = "données — résumé.csv";
    expect(sanitizeFileSystemName(name)).toBe(name);
  });

  it("NFC-normalizes the result", () => {
    const nfd = "café".normalize("NFD");
    const nfc = "café".normalize("NFC");
    expect(sanitizeFileSystemName(nfd)).toBe(nfc);
  });
});

describe("DustFileSystem.normalizeScopedPath strips control characters", () => {
  it("strips leading control characters from the filename segment", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/\n\tsummary.txt")
    ).toBe("conversation-abc/summary.txt");
  });

  it("strips control characters embedded in the mount prefix", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc\x00/notes.txt")
    ).toBe("conversation-abc/notes.txt");
  });

  it("still rejects path traversal after stripping controls", () => {
    expect(
      DustFileSystem.normalizeScopedPath("conversation-abc/\n../../etc/passwd")
    ).toBeNull();
  });
});
