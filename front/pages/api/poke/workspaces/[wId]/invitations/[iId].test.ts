import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[iId]";

// Mock SendGrid so no real emails are sent.
vi.spyOn(sgMail, "setApiKey").mockImplementation(() => {});
vi.spyOn(sgMail, "send").mockResolvedValue([
  { statusCode: 202, headers: {}, body: {} },
  {},
] as never);

// Mock config to provide required values for invitation emails.
vi.mock(import("@app/lib/api/config"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    default: {
      ...mod.default,
      getSendgridApiKey: vi.fn().mockReturnValue("SG.test"),
      getInvitationEmailTemplate: vi.fn().mockReturnValue("d-test"),
      getSupportEmailAddress: vi.fn().mockReturnValue("test@dust.tt"),
      getAppUrl: vi.fn().mockReturnValue("http://localhost:3000"),
      getDustInviteTokenSecret: vi
        .fn()
        .mockReturnValue("test-invite-secret-32chars!!!!!"),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/poke/workspaces/[wId]/invitations/[iId]", () => {
  it("revokes the old invitation and creates a new one with a fresh createdAt", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
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

    req.query.iId = invitation.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
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
