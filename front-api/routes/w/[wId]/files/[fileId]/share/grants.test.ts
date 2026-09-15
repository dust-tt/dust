import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { frameContentType } from "@app/types/files";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/share/grants`;
}

async function grantInviteToEveryone(workspace: { sId: string }) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await GroupPermissionResource.setForEverybody(adminAuth, {
    grantType: "invite",
    resourceType: "frame",
  });
}

async function setSharingPolicy(
  workspace: { sId: string },
  sharingPolicy: WorkspaceSharingPolicy
) {
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    throw new Error(`Workspace ${workspace.sId} not found.`);
  }
  await workspaceResource.updateWorkspaceSettings({ sharingPolicy });
}

function getGrants(workspace: { sId: string }, fileId: string) {
  return honoApp.request(url(workspace, fileId));
}

function postGrants(workspace: { sId: string }, fileId: string, body: unknown) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteGrant(
  workspace: { sId: string },
  fileId: string,
  body: unknown
) {
  return honoApp.request(url(workspace, fileId), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sharing grants endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 for non-interactive-content files", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await getGrants(workspace, file.sId);

    expect(response.status).toBe(400);
  });

  it("should return empty grants list for a new frame", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await getGrants(workspace, file.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).grants).toEqual([]);
  });

  it("should add grants for multiple emails", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com", "bob@example.com"],
    });

    expect(response.status).toBe(200);
    const { grants } = await response.json();
    expect(grants).toHaveLength(2);
    expect(grants.map((g: { email: string }) => g.email).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.email_grant_added",
        metadata: {
          frame_name: "test-frame.tsx",
          emails: "alice@example.com,bob@example.com",
        },
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({ type: "frame", id: file.sId }),
        ],
      })
    );
  });

  it("returns 400 for Resource validation errors without adding grants or emitting an audit event", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);
    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });
    mockEmitAuditLogEvent.mockClear();

    const response = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com", `${"a".repeat(256)}@example.com`],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: expect.stringContaining("255"),
      },
    });
    expect(await file.listActiveSharingGrants()).toEqual([]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("should populate grantedBy with the granting user", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });

    expect(response.status).toBe(200);
    const { grants } = await response.json();
    expect(grants).toHaveLength(1);
    expect(grants[0].grantedBy).not.toBeNull();
    expect(grants[0].grantedBy.sId).toBe(user.sId);
    expect(grants[0].grantedBy.email).toBe(user.email);
  });

  it("should be idempotent when adding the same email twice", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const first = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(first.status).toBe(200);
    const firstGrants = (await first.json()).grants;
    expect(firstGrants).toHaveLength(1);

    const second = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(second.status).toBe(200);
    const secondGrants = (await second.json()).grants;
    expect(secondGrants).toHaveLength(1);
    expect(secondGrants[0].id).toBe(firstGrants[0].id);
  });

  it("should normalize email to lowercase", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["Alice@Example.COM"],
    });

    expect(response.status).toBe(200);
    expect((await response.json()).grants[0].email).toBe("alice@example.com");
  });

  it("should revoke a grant and no longer list it", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    await grantInviteToEveryone(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const addRes = await postGrants(workspace, file.sId, {
      emails: ["alice@example.com"],
    });
    expect(addRes.status).toBe(200);
    const grantId = (await addRes.json()).grants[0].id;

    const delRes = await deleteGrant(workspace, file.sId, { grantId });
    expect(delRes.status).toBe(204);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.email_grant_revoked",
        metadata: {
          frame_name: "test-frame.tsx",
          email: "alice@example.com",
        },
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({ type: "frame", id: file.sId }),
        ],
      })
    );

    const listRes = await getGrants(workspace, file.sId);
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).grants).toEqual([]);
  });

  describe("workspace_only sharing policy", () => {
    it("blocks inviting an external email", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await setSharingPolicy(workspace, "workspace_only");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("blocks an admin from inviting an external email (policy overrides admin)", async () => {
      // The workspace policy is checked before the permission/admin bypass, so even an admin
      // cannot invite externally when external sharing is disabled at the workspace level.
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      await setSharingPolicy(workspace, "workspace_only");

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("allows inviting a workspace member", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await setSharingPolicy(workspace, "workspace_only");

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: [member.email],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe(member.email.toLowerCase());
    });

    it("marks existing external grants as blockedByPolicy on GET", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      // Add a grant while policy is still permissive.
      await file.addSharingGrants(auth, { emails: ["external@example.com"] });

      // Now restrict to workspace_only.
      await setSharingPolicy(workspace, "workspace_only");

      const response = await getGrants(workspace, file.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
      expect(grants[0].blockedByPolicy).toBe(true);
    });

    it("does not mark workspace member grants as blockedByPolicy on GET", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      await file.addSharingGrants(auth, { emails: [member.email] });

      await setSharingPolicy(workspace, "workspace_only");

      const response = await getGrants(workspace, file.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].blockedByPolicy).toBe(false);
    });

    it("blocks if any email in the batch is not a workspace member", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      await setSharingPolicy(workspace, "workspace_only");

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: [member.email, "external@example.com"],
      });

      expect(response.status).toBe(403);
    });
  });

  describe("invite permission (external sharing allowed by policy)", () => {
    it("blocks inviting an external email without the invite permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("blocks inviting an external email when the policy allows external sharing but the caller lacks the invite permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      // The workspace policy explicitly allows external sharing...
      await setSharingPolicy(workspace, "workspace_and_emails");

      // ...but the caller was never granted the "invite" frame permission.
      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("allows inviting a workspace member without the invite permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: [member.email],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe(member.email.toLowerCase());
    });

    it("allows inviting an external email with the invite permission", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await grantInviteToEveryone(workspace);

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
    });

    it("allows an admin to invite an external email without an explicit invite grant", async () => {
      // Admins hold every governance capability by default, so they can invite externally
      // whenever the workspace policy allows it — no seeded "invite" grant required.
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      const response = await postGrants(workspace, file.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
    });

    it("does not mark existing external grants as blockedByPolicy for a viewer lacking the invite permission", async () => {
      // blockedByPolicy tracks the workspace policy, not the viewer's permission: a user who
      // can't create external invites can still see existing ones as active while the policy
      // continues to allow external sharing.
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const file = await FileFactory.create(auth, user, {
        contentType: frameContentType,
        fileName: "test-frame.tsx",
        fileSize: 1024,
        status: "ready",
        useCase: "conversation",
      });

      // Seed an external grant directly (bypasses the endpoint's permission check).
      await file.addSharingGrants(auth, { emails: ["external@example.com"] });

      const response = await getGrants(workspace, file.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
      expect(grants[0].blockedByPolicy).toBeFalsy();
    });
  });

  it("should return 404 when revoking a non-existent grant", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await deleteGrant(workspace, file.sId, {
      grantId: 999999,
    });

    expect(response.status).toBe(404);
  });

  it("should reject invalid email addresses", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postGrants(workspace, file.sId, {
      emails: ["not-an-email"],
    });

    expect(response.status).toBe(400);
  });

  describe("frames with functions", () => {
    it("blocks inviting an external email to a frame with functions", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      // Opens both gates the refusal could otherwise be attributed to.
      await setSharingPolicy(workspace, "all_scopes");
      await grantInviteToEveryone(workspace);
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });

      const response = await postGrants(workspace, frame.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
      expect(await frame.listActiveSharingGrants()).toHaveLength(0);
    });

    it("blocks an admin from inviting an external email to a frame with functions", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      await setSharingPolicy(workspace, "all_scopes");
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });

      const response = await postGrants(workspace, frame.sId, {
        emails: ["external@example.com"],
      });

      expect(response.status).toBe(403);
    });

    it("allows inviting a workspace member to a frame with functions", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });

      const response = await postGrants(workspace, frame.sId, {
        emails: [member.email],
      });

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe(member.email.toLowerCase());
    });

    it("blocks the batch if any email is not a workspace member", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");
      await grantInviteToEveryone(workspace);
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });

      const response = await postGrants(workspace, frame.sId, {
        emails: [member.email, "external@example.com"],
      });

      expect(response.status).toBe(403);
      expect(await frame.listActiveSharingGrants()).toHaveLength(0);
    });

    it("marks pre-existing external grants as blockedByPolicy on GET", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");
      await grantInviteToEveryone(workspace);
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });
      await frame.addSharingGrants(auth, { emails: ["external@example.com"] });

      const response = await getGrants(workspace, frame.sId);

      expect(response.status).toBe(200);
      const { grants } = await response.json();
      expect(grants).toHaveLength(1);
      expect(grants[0].email).toBe("external@example.com");
      expect(grants[0].blockedByPolicy).toBe(true);
    });

    it("allows revoking a grant on a frame with functions", async () => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });
      await setSharingPolicy(workspace, "all_scopes");
      await grantInviteToEveryone(workspace);
      const space = await SpaceFactory.project(workspace);
      const { frame } = await createTestFrameFunction(auth, { space });
      const result = await frame.addSharingGrants(auth, {
        emails: ["external@example.com"],
      });
      assert(result.isOk());
      const [grant] = result.value;

      const response = await deleteGrant(workspace, frame.sId, {
        grantId: grant.id,
      });

      expect(response.status).toBe(204);
      expect(await frame.listActiveSharingGrants()).toHaveLength(0);
    });
  });
});

describe("domain sharing grants", () => {
  async function setup() {
    const ctx = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const file = await FileFactory.create(ctx.auth, ctx.user, {
      contentType: frameContentType,
      fileName: "frame.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });
    return { ...ctx, file };
  }

  beforeEach(() => vi.clearAllMocks());

  it("adds mixed targets, audits only new grants and revokes by string ID", async () => {
    const { auth, workspace, file } = await setup();
    await FeatureFlagFactory.basic(auth, "frame_domain_sharing");
    await grantInviteToEveryone(workspace);
    const body = {
      emails: ["alice@example.com"],
      domains: ["EXAMPLE.COM", "@example.com"],
    };
    const response = await postGrants(workspace, file.sId, body);
    expect(response.status).toBe(200);
    const { grants, accessGrants, viewers, canGrantDomains } =
      await response.json();
    expect(grants).toHaveLength(1);
    expect(grants[0].email).toBe("alice@example.com");
    expect(accessGrants).toHaveLength(2);
    expect(viewers).toEqual([]);
    expect(canGrantDomains).toBe(true);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.domain_grant_added",
        metadata: { frame_name: "frame.tsx", domains: "example.com" },
      })
    );
    mockEmitAuditLogEvent.mockClear();
    expect((await postGrants(workspace, file.sId, body)).status).toBe(200);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
    const [domain] = (await SharingGrantResource.listForFile(file)).filter(
      (grant) => grant.domain
    );
    assert(domain);
    expect(
      (await deleteGrant(workspace, file.sId, { grantId: domain.id })).status
    ).toBe(404);
    expect(
      (await deleteGrant(workspace, file.sId, { grantId: domain.sId })).status
    ).toBe(204);
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.domain_grant_revoked",
        metadata: { frame_name: "frame.tsx", domain: "example.com" },
      })
    );
    expect(
      await SharingGrantResource.findForEmail(file, "bob@example.com")
    ).toBeNull();
    expect(
      await SharingGrantResource.findForEmail(file, "alice@example.com")
    ).not.toBeNull();
  });

  it("requires the flag and invitation permission before creating any target", async () => {
    const { auth, workspace, file } = await setup();
    const body = { emails: ["alice@example.com"], domains: ["example.com"] };
    expect((await postGrants(workspace, file.sId, body)).status).toBe(403);
    await FeatureFlagFactory.basic(auth, "frame_domain_sharing");
    expect((await postGrants(workspace, file.sId, body)).status).toBe(403);
    expect(await SharingGrantResource.listForFile(file)).toEqual([]);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
    await grantInviteToEveryone(workspace);
    for (const domains of [["*.example.com"], ["https://example.com"]]) {
      expect((await postGrants(workspace, file.sId, { domains })).status).toBe(
        400
      );
    }
    expect((await postGrants(workspace, file.sId, body)).status).toBe(200);
    await setSharingPolicy(workspace, "workspace_only");
    expect(
      (await postGrants(workspace, file.sId, { domains: ["example.org"] }))
        .status
    ).toBe(403);
    const state = await (await getGrants(workspace, file.sId)).json();
    expect(state.canGrantDomains).toBe(false);
    expect(state.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { kind: "domain", value: "example.com" },
          blockedByPolicy: true,
        }),
      ])
    );
  });

  it("blocks domain additions to Frames with functions and marks older domain grants", async () => {
    const { auth, workspace } = await setup();
    await FeatureFlagFactory.basic(auth, "frame_domain_sharing");
    await grantInviteToEveryone(workspace);
    const space = await SpaceFactory.project(workspace);
    const { frame } = await createTestFrameFunction(auth, { space });
    await SharingGrantFactory.create(auth, frame, {
      kind: "domain",
      value: "example.com",
    });
    expect(
      (await postGrants(workspace, frame.sId, { domains: ["example.org"] }))
        .status
    ).toBe(403);
    const state = await (await getGrants(workspace, frame.sId)).json();
    expect(state.canGrantDomains).toBe(false);
    expect(state.grants).toEqual([]);
    expect(state.accessGrants).toEqual([
      expect.objectContaining({ blockedByPolicy: true }),
    ]);
  });

  it("keeps viewer identities and daily frequency after revocation and scopes grant IDs to the file", async () => {
    const { auth, user, workspace, file } = await setup();
    const grant = await SharingGrantFactory.create(auth, file, {
      kind: "domain",
      value: "example.com",
    });
    for (const viewedAt of [
      "2026-09-13T08:00:00Z",
      "2026-09-14T08:00:00Z",
      "2026-09-14T10:00:00Z",
    ]) {
      await file.recordView({
        verifiedEmail: "alice@example.com",
        viewedAt: new Date(viewedAt),
      });
    }
    await file.recordView({
      verifiedEmail: "bob@example.com",
      viewedAt: new Date("2026-09-14T09:00:00Z"),
    });
    const otherFile = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "other.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });
    expect(
      (await deleteGrant(workspace, otherFile.sId, { grantId: grant.sId }))
        .status
    ).toBe(404);
    expect(
      (await deleteGrant(workspace, file.sId, { grantId: grant.sId })).status
    ).toBe(204);
    const state = await (await getGrants(workspace, file.sId)).json();
    expect(state.accessGrants).toEqual([]);
    expect(state.viewers).toEqual([
      {
        email: "alice@example.com",
        firstViewedAt: Date.parse("2026-09-13T08:00:00Z"),
        lastViewedAt: Date.parse("2026-09-14T10:00:00Z"),
        viewedDays: 2,
      },
      {
        email: "bob@example.com",
        firstViewedAt: Date.parse("2026-09-14T09:00:00Z"),
        lastViewedAt: Date.parse("2026-09-14T09:00:00Z"),
        viewedDays: 1,
      },
    ]);
    const otherWorkspace = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    expect((await getGrants(otherWorkspace.workspace, file.sId)).status).toBe(
      404
    );
  });
});
