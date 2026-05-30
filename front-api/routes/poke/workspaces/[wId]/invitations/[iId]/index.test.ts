import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import { honoApp } from "@front-api/app";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock SendGrid so no real emails are sent.
vi.spyOn(sgMail, "setApiKey").mockImplementation(() => {});
vi.spyOn(sgMail, "send").mockResolvedValue([
  { statusCode: 202, headers: {}, body: {} },
  {},
] as never);

function patchInvitation(workspace: { sId: string }, invitationSId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/invitations/${invitationSId}`,
    { method: "PATCH" }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/poke/workspaces/:wId/invitations/:iId", () => {
  it("revokes the old invitation and creates a new one with a fresh createdAt", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      isSuperUser: true,
      role: "admin",
    });

    // Create a pending invitation that was created 5 days ago.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "test-reinvite@example.com",
      status: "pending",
      initialRole: "user",
      createdAt: fiveDaysAgo,
    });

    const response = await patchInvitation(workspace, invitation.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.email).toBe("test-reinvite@example.com");

    // The original invitation should now be revoked.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const oldInvitation = await MembershipInvitationResource.fetchById(
      adminAuth,
      invitation.sId
    );
    expect(oldInvitation).not.toBeNull();
    expect(oldInvitation!.status).toBe("revoked");

    // A new pending invitation should exist for the same email.
    const newInvitations =
      await MembershipInvitationResource.getPendingForEmailAndWorkspace({
        email: "test-reinvite@example.com",
        workspace,
        includeExpired: false,
      });
    expect(newInvitations).not.toBeNull();
    expect(newInvitations!.sId).not.toBe(invitation.sId);

    // The new invitation should have a recent createdAt (within the last minute).
    const newCreatedAtMs = newInvitations!.createdAt.getTime();
    expect(newCreatedAtMs).toBeGreaterThan(Date.now() - 60_000);
  });
});
