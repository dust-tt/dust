import { authorizeSandboxFunctionInvocation } from "@app/lib/api/sandbox_functions/workspace_user";
import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameTrustResource } from "@app/lib/resources/frame_trust_resource";
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

// A `fast` function never needs trust, so these cases only exercise the identity policy.
const POLICY_ONLY = { executionMode: "fast", publicationId: "unused" } as const;

describe("authorizeSandboxFunctionInvocation for Frames", () => {
  it("requires a workspace member even when identity is optional", async () => {
    const { workspace, adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(
      userlessAuth,
      {
        ...POLICY_ONLY,
        userIdentity: "optional",
        origin: "delegated",
        owner: { kind: "frame", frame },
      }
    );

    expect(authorization.authorized).toBe(false);
  });

  it("resolves the Frame runtime scope and its Pod", async () => {
    const { workspace, adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      ...POLICY_ONLY,
      userIdentity: "workspace_user_required",
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
      ...POLICY_ONLY,
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
    await addToSpaceGroup(adminAuth, newSpace, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      ...POLICY_ONLY,
      userIdentity: "workspace_user_required",
      origin: "interactive_session",
      owner: {
        kind: "frame",
        frame,
        scope: { spaceId: newSpace.sId },
      },
    });

    // The caller belongs to the new space only, so resolving from the Frame's own metadata would
    // fail to fetch the old space rather than land here.
    expect(authorization).toMatchObject({
      authorized: true,
      runtimeSpaceId: newSpace.sId,
      pod: expect.objectContaining({ sId: newSpace.sId }),
    });
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
      ...POLICY_ONLY,
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
      ...POLICY_ONLY,
      userIdentity: "frame_author_required",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(true);
  });

  it("denies a workspace admin outside the Pod", async () => {
    // Admins hold `admin` on a Pod but not `write`, so they cannot write a Pod-hosted Frame's
    // source and are not its authors.
    const { workspace, adminAuth, space } = await setup();
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

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      ...POLICY_ONLY,
      userIdentity: "frame_author_required",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(false);
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
        ...POLICY_ONLY,
        userIdentity: "frame_author_required",
        origin: "interactive_session",
        owner: { kind: "frame", frame },
      }
    );

    expect(authorization.authorized).toBe(false);
  });
});

describe("authorizeSandboxFunctionInvocation across server revisions", () => {
  it("fails closed for a policy persisted by a newer server revision", async () => {
    const { adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    const persistedPolicy =
      "future_policy" as SandboxFunctionUserIdentityPolicy;

    const authorization = await authorizeSandboxFunctionInvocation(adminAuth, {
      ...POLICY_ONLY,
      userIdentity: persistedPolicy,
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(false);
    if (!authorization.authorized) {
      expect(authorization.errorMessage).toContain(
        "unsupported user identity policy"
      );
    }
  });

  it("fails closed for the retired pod_member_required policy", async () => {
    const { workspace, adminAuth, space } = await setup();
    const member = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", member);
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    const frame = await createFrame(adminAuth, space);
    const retiredPolicy =
      "pod_member_required" as SandboxFunctionUserIdentityPolicy;

    const authorization = await authorizeSandboxFunctionInvocation(memberAuth, {
      ...POLICY_ONLY,
      userIdentity: retiredPolicy,
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    // The caller would have satisfied the retired policy. Rows still carrying it are denied until
    // they are republished, rather than silently falling back to a weaker check.
    expect(authorization.authorized).toBe(false);
  });
});

describe("authorizeSandboxFunctionInvocation tool trust", () => {
  async function setupTrust() {
    const { workspace, adminAuth, space } = await setup();
    const frame = await createFrame(adminAuth, space);
    await FramePublicationResource.makeNew(adminAuth, {
      frame,
      publicationId: "publication-1",
    });
    const viewer = await makeWorkspaceMember(workspace);
    await addToSpaceGroup(adminAuth, space, "member", viewer);
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      viewer.sId,
      workspace.sId
    );

    return { workspace, adminAuth, space, frame, viewer, viewerAuth };
  }

  function authorizeDurable(
    auth: Authenticator,
    frame: FileResource,
    publicationId = "publication-1"
  ) {
    return authorizeSandboxFunctionInvocation(auth, {
      userIdentity: "optional",
      executionMode: "durable",
      publicationId,
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });
  }

  it("lets the publisher invoke a function that can call tools", async () => {
    const { adminAuth, frame } = await setupTrust();

    const authorization = await authorizeDurable(adminAuth, frame);

    expect(authorization.authorized).toBe(true);
  });

  it("requires another user to trust the publisher", async () => {
    const { adminAuth, frame, viewerAuth } = await setupTrust();

    expect(await authorizeDurable(viewerAuth, frame)).toMatchObject({
      authorized: false,
      errorCode: "frame_trust_required",
    });

    await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: adminAuth.getNonNullableUser().id,
    });

    expect((await authorizeDurable(viewerAuth, frame)).authorized).toBe(true);
  });

  it("does not require trust for a fast function", async () => {
    const { frame, viewerAuth } = await setupTrust();

    const authorization = await authorizeSandboxFunctionInvocation(viewerAuth, {
      userIdentity: "optional",
      executionMode: "fast",
      publicationId: "publication-1",
      origin: "interactive_session",
      owner: { kind: "frame", frame },
    });

    expect(authorization.authorized).toBe(true);
  });

  it("asks again when another user publishes", async () => {
    const { workspace, adminAuth, frame, viewerAuth } = await setupTrust();
    await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: adminAuth.getNonNullableUser().id,
    });
    const coEditor = await makeWorkspaceMember(workspace);
    const coEditorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      coEditor.sId,
      workspace.sId
    );
    await FramePublicationResource.makeNew(coEditorAuth, {
      frame,
      publicationId: "publication-2",
    });

    expect(
      await authorizeDurable(viewerAuth, frame, "publication-2")
    ).toMatchObject({
      authorized: false,
      errorCode: "frame_trust_required",
    });
  });

  it("refuses a publication with no known publisher", async () => {
    const { adminAuth, frame } = await setupTrust();

    expect(
      await authorizeDurable(adminAuth, frame, "unrecorded-publication")
    ).toMatchObject({
      authorized: false,
      errorCode: "frame_trust_required",
    });
  });
});
