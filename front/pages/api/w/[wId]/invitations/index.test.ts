import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

vi.spyOn(sgMail, "setApiKey").mockImplementation(() => {});
const sgSendMock = vi
  .spyOn(sgMail, "send")
  .mockResolvedValue([{ statusCode: 202, headers: {}, body: {} }, {}] as never);

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

describe("POST /api/w/[wId]/invitations", () => {
  it("creates invitations for multiple new emails in a single request", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = [
      { email: "new-user-1@example.com", role: "user" },
      { email: "new-user-2@example.com", role: "builder" },
      { email: "new-user-3@example.com", role: "admin" },
    ];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveLength(3);
    expect(data.every((r: { success: boolean }) => r.success)).toBe(true);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(3);

    const byEmail = new Map(invitations.map((i) => [i.inviteEmail, i]));
    expect(byEmail.get("new-user-1@example.com")?.initialRole).toBe("user");
    expect(byEmail.get("new-user-2@example.com")?.initialRole).toBe("builder");
    expect(byEmail.get("new-user-3@example.com")?.initialRole).toBe("admin");

    expect(sgSendMock).toHaveBeenCalledTimes(3);
  });

  it("updates the role on an existing pending invitation without creating a new row", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    // Invitations created in the last 24h hit the "already sent recently"
    // rate limit, so age the existing invitation past that window but stay
    // under the 7-day expiration so the role-update path fires.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const existing = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "role-change@example.com",
      status: "pending",
      initialRole: "user",
      createdAt: twoDaysAgo,
    });

    req.body = [{ email: "role-change@example.com", role: "admin" }];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toEqual([{ success: true, email: "role-change@example.com" }]);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(1);
    expect(invitations[0].sId).toBe(existing.sId);
    expect(invitations[0].initialRole).toBe("admin");
  });

  it("revokes an expired invitation and creates a fresh one", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    // 7-day expiration window, use 8 days ago to force expiration.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const expired = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "expired@example.com",
      status: "pending",
      initialRole: "user",
      createdAt: eightDaysAgo,
    });

    req.body = [{ email: "expired@example.com", role: "builder" }];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toEqual([{ success: true, email: "expired@example.com" }]);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const oldInvitation = await MembershipInvitationResource.fetchById(
      adminAuth,
      expired.sId
    );
    expect(oldInvitation?.status).toBe("revoked");

    const pending =
      await MembershipInvitationResource.getPendingForEmailAndWorkspace({
        email: "expired@example.com",
        workspace,
      });
    expect(pending).not.toBeNull();
    expect(pending!.sId).not.toBe(expired.sId);
    expect(pending!.initialRole).toBe("builder");
  });

  it("deduplicates same-email requests to a single DB row but sends all emails", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = [
      { email: "dup@example.com", role: "user" },
      { email: "dup@example.com", role: "admin" },
    ];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveLength(2);
    expect(data.every((r: { success: boolean }) => r.success)).toBe(true);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(1);
    // Last role in the request wins.
    expect(invitations[0].initialRole).toBe("admin");

    expect(sgSendMock).toHaveBeenCalledTimes(2);
  });

  it("rejects invitations for existing active members without creating a row", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = [
      { email: user.email, role: "user" },
      { email: "brand-new@example.com", role: "user" },
    ];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData() as {
      success: boolean;
      email: string;
      error_message?: string;
    }[];
    expect(data).toHaveLength(2);

    const byEmail = new Map(data.map((r) => [r.email, r]));
    expect(byEmail.get(user.email)?.success).toBe(false);
    expect(byEmail.get(user.email)?.error_message).toMatch(
      /existing active member/i
    );
    expect(byEmail.get("brand-new@example.com")?.success).toBe(true);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(1);
    expect(invitations[0].inviteEmail).toBe("brand-new@example.com");

    expect(sgSendMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid email addresses without creating any invitation", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = [
      { email: "valid@example.com", role: "user" },
      { email: "not-an-email", role: "user" },
    ];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(0);
    expect(sgSendMock).not.toHaveBeenCalled();
  });

  it("keeps the invitation in the DB even when the email send fails", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    sgSendMock.mockRejectedValueOnce(new Error("SendGrid down"));

    req.body = [{ email: "email-fails@example.com", role: "user" }];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveLength(1);
    expect(data[0].success).toBe(false);
    expect(data[0].email).toBe("email-fails@example.com");

    const pending =
      await MembershipInvitationResource.getPendingForEmailAndWorkspace({
        email: "email-fails@example.com",
        workspace,
      });
    expect(pending).not.toBeNull();
    expect(pending!.status).toBe("pending");
  });
});
