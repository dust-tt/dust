import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function invitationUrl(wId: string, iId: string) {
  return `/api/w/${wId}/invitations/${iId}`;
}

describe("POST /api/w/:wId/invitations/:iId", () => {
  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "someone@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", initialRole: "user" }),
      }
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 404 when the invitation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, "mi_does_not_exist"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", initialRole: "user" }),
      }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("invitation_not_found");
  });

  it("returns 400 when the body is invalid", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "someone@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "garbage", initialRole: "user" }),
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("revokes a pending invitation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "to-revoke@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", initialRole: "user" }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.invitation.status).toBe("revoked");
    expect(data.invitation.sId).toBe(invitation.sId);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const reloaded = await MembershipInvitationResource.fetchById(
      adminAuth,
      invitation.sId
    );
    expect(reloaded?.status).toBe("revoked");
  });

  it("updates the initial role of a pending invitation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "promoted@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", initialRole: "admin" }),
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.invitation.initialRole).toBe("admin");

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const reloaded = await MembershipInvitationResource.fetchById(
      adminAuth,
      invitation.sId
    );
    expect(reloaded?.initialRole).toBe("admin");
    expect(reloaded?.status).toBe("pending");
  });

  it("returns 403 when a business admin tries to elevate an invitation to admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "to-elevate@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", initialRole: "admin" }),
      }
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("workspace_auth_error");
    expect(data.error.message).toBe(
      "You do not have permission to manage admin invitations."
    );

    // The role must not have changed.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const reloaded = await MembershipInvitationResource.fetchById(
      adminAuth,
      invitation.sId
    );
    expect(reloaded?.initialRole).toBe("user");
  });

  it("returns 403 when a business admin tries to modify an existing admin invitation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "existing-admin@example.com",
      status: "pending",
      initialRole: "admin",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", initialRole: "admin" }),
      }
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe(
      "You do not have permission to manage admin invitations."
    );

    // The invitation must remain untouched.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const reloaded = await MembershipInvitationResource.fetchById(
      adminAuth,
      invitation.sId
    );
    expect(reloaded?.status).toBe("pending");
  });

  it("allows a business admin to revoke a non-admin invitation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
    });
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "to-revoke@example.com",
      status: "pending",
      initialRole: "user",
    });

    const response = await honoApp.request(
      invitationUrl(workspace.sId, invitation.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", initialRole: "user" }),
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).invitation.status).toBe("revoked");
  });
});
