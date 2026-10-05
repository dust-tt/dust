// @vitest-environment node

import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
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
import { frameContentType, frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function makeWorkspaceMember(
  workspace: LightWorkspaceType
): Promise<UserResource> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  return user;
}

async function addPodMember(
  adminAuth: Authenticator,
  pod: SpaceResource,
  user: UserResource
): Promise<void> {
  const group = await pod.fetchManualMemberGroup(adminAuth);
  if (!group) {
    throw new Error("Expected the Pod member group to exist.");
  }
  const result = await group.dangerouslyAddMember(adminAuth, {
    user: user.toJSON(),
  });
  expect(result.isOk()).toBe(true);
}

describe("canWriteFrameV2Source", () => {
  it("allows a user who can access a standalone conversation", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(auth, null, {
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

    await expect(canWriteFrameV2Source(auth, frame)).resolves.toBe(true);
  });

  it("allows a Pod member because Pod membership grants source write access", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const member = await makeWorkspaceMember(workspace);
    await addPodMember(adminAuth, pod, member);
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
      useCaseMetadata: { spaceId: pod.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: pod.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    await expect(canWriteFrameV2Source(memberAuth, frame)).resolves.toBe(true);
  });

  it("denies a workspace member without write access to the source Pod", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
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
      useCaseMetadata: { spaceId: pod.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: pod.sId,
      })}Admin/${FRAME_MANIFEST_FILE}`,
    });

    await expect(canWriteFrameV2Source(outsiderAuth, frame)).resolves.toBe(
      false
    );
  });

  it("denies callers without a user", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const frame = await FileFactory.create(auth, null, {
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
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    await expect(canWriteFrameV2Source(userlessAuth, frame)).resolves.toBe(
      false
    );
  });

  it("denies legacy Frames and Frame v2 files without a scoped source path", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const legacyFrame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });
    const unscopedFrame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    await expect(canWriteFrameV2Source(auth, legacyFrame)).resolves.toBe(false);
    await expect(canWriteFrameV2Source(auth, unscopedFrame)).resolves.toBe(
      false
    );
  });
});
