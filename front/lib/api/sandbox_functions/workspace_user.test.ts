import { authorizeSandboxFunctionInvocation } from "@app/lib/api/sandbox_functions/workspace_user";
import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { SandboxFunctionUserIdentityPolicy } from "@app/types/api/sandbox_functions";
import { frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function setup() {
  const {
    workspace,
    authenticator: adminAuth,
    globalSpace,
  } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.project(workspace);
  return { workspace, adminAuth, globalSpace, space };
}

async function makeWorkspaceMember(
  workspace: LightWorkspaceType
): Promise<UserResource> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  return user;
}

async function addToSpaceGroup(
  adminAuth: Authenticator,
  space: SpaceResource,
  role: "member" | "editor",
  user: UserResource
): Promise<void> {
  const group =
    role === "editor"
      ? await space.fetchManualEditorGroup(adminAuth)
      : await space.fetchManualMemberGroup(adminAuth);
  if (!group) {
    throw new Error(`Expected the ${role} group to exist.`);
  }
  const addMemberResult = await group.dangerouslyAddMember(adminAuth, {
    user: user.toJSON(),
  });
  expect(addMemberResult.isOk()).toBe(true);
}

async function authorizePodMemberRequired(
  auth: Authenticator,
  space: SpaceResource
) {
  return authorizeSandboxFunctionInvocation(auth, {
    userIdentity: "pod_member_required",
    origin: "interactive_session",
    owner: { kind: "pod", space },
  });
}

describe("authorizeSandboxFunctionInvocation with pod_member_required", () => {
  it("authorizes a member of the pod member group", async () => {
    const { workspace, adminAuth, space } = await setup();
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const authorization = await authorizePodMemberRequired(memberAuth, space);

    expect(authorization.authorized).toBe(true);
    if (authorization.authorized) {
      expect(authorization.user?.sId).toBe(member.sId);
    }
  });

  it("authorizes a member of the pod editor group", async () => {
    const { workspace, adminAuth, space } = await setup();
    const editor = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "editor", editor);
    const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editor.sId,
      workspace.sId
    );

    const authorization = await authorizePodMemberRequired(editorAuth, space);

    expect(authorization.authorized).toBe(true);
  });

  it("denies a workspace member outside the pod", async () => {
    const { workspace, space } = await setup();
    const outsider = await makeWorkspaceMember(workspace);
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    const authorization = await authorizePodMemberRequired(outsiderAuth, space);

    expect(authorization.authorized).toBe(false);
    if (!authorization.authorized) {
      expect(authorization.errorMessage).toContain("member");
    }
  });

  it("denies a workspace admin outside the pod", async () => {
    // Admins hold `admin` on pods but not `write`, so they cannot publish pod functions and are
    // not treated as members either.
    const { adminAuth, space } = await setup();

    const authorization = await authorizePodMemberRequired(adminAuth, space);

    expect(authorization.authorized).toBe(false);
  });

  it("denies a userless caller", async () => {
    const { workspace, space } = await setup();
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const authorization = await authorizePodMemberRequired(userlessAuth, space);

    expect(authorization.authorized).toBe(false);
  });
});

describe("authorizeSandboxFunctionInvocation for Frames", () => {
  async function createFrame(adminAuth: Authenticator, space: SpaceResource) {
    return FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "tasks.frame.json",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { spaceId: space.sId },
    });
  }

  it("requires a workspace member even when identity is optional", async () => {
    const { workspace, adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(
      userlessAuth,
      {
        userIdentity: "optional",
        origin: "delegated",
        owner: { kind: "frame", frame },
      }
    );

    expect(authorization.authorized).toBe(false);
  });

  it("resolves the Frame runtime scope and Pod membership", async () => {
    const { workspace, adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      userIdentity: "pod_member_required",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization).toMatchObject({
      authorized: true,
      runtimeSpaceId: space.sId,
      pod: expect.objectContaining({ sId: space.sId }),
      user: expect.objectContaining({ sId: member.sId }),
    });
  });

  it("uses the global space for a Frame in a standalone conversation", async () => {
    const { adminAuth, globalSpace } = await setup();
    const conversation = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "tasks.frame.json",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      userIdentity: "optional",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization).toMatchObject({
      authorized: true,
      runtimeSpaceId: globalSpace.sId,
      pod: null,
    });
  });

  it("uses the lifecycle scope instead of stale Frame location metadata", async () => {
    const { workspace, adminAuth, space: oldSpace } = await setup();
    const newSpace = await SpaceFactory.project(workspace);
    const frame = await createFrame(adminAuth, oldSpace);
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, oldSpace, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      userIdentity: "pod_member_required",
      origin: "interactive_session",
      owner: {
        kind: "frame",
        frame,
        scope: { spaceId: newSpace.sId },
      },
    });

    expect(authorization.authorized).toBe(false);
  });

  it("authorizes a standalone conversation Frame author", async () => {
    const { workspace, adminAuth } = await setup();
    const conversation = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      userIdentity: "frame_author_required",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(true);
  });

  it("authorizes a Pod member who can write the Frame source", async () => {
    const { workspace, adminAuth, space } = await setup();
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    const frame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: space.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      userIdentity: "frame_author_required",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(true);
  });

  it("denies a workspace member who cannot write the Frame source", async () => {
    const { workspace, adminAuth, space } = await setup();
    const outsider = await makeWorkspaceMember(workspace);
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );
    const frame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: space.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    const authorization = await authorizeSandboxFunctionInvocation(
      outsiderAuth,
      {
        userIdentity: "frame_author_required",
        origin: "interactive_session",
        owner: { kind: "frame", frame },
      }
    );

    expect(authorization.authorized).toBe(false);
  });

  it("denies frame_author_required for legacy Pod Functions", async () => {
    const { adminAuth, space } = await setup();

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      userIdentity: "frame_author_required",
      origin: "interactive_session",
      owner: { kind: "pod", space },
    });

    expect(authorization.authorized).toBe(false);
  });
});

describe("authorizeSandboxFunctionInvocation across server revisions", () => {
  it("fails closed for a policy persisted by a newer server revision", async () => {
    const { adminAuth, space } = await setup();
    const persistedPolicy =
      "future_policy" as SandboxFunctionUserIdentityPolicy;

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      userIdentity: persistedPolicy,
      origin: "interactive_session",
      owner: { kind: "pod", space },
    });

    expect(authorization.authorized).toBe(false);
    if (!authorization.authorized) {
      expect(authorization.errorMessage).toContain(
        "unsupported user identity policy"
      );
    }
  });
});
