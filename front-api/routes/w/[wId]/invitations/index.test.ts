import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.spyOn(sgMail, "setApiKey").mockImplementation(() => {});
const sgSendMock = vi
  .spyOn(sgMail, "send")
  .mockResolvedValue([{ statusCode: 202, headers: {}, body: {} }, {}] as never);

import { honoApp } from "@front-api/app";

beforeEach(() => {
  vi.clearAllMocks();
});

function invitationsUrl(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const base = `/api/w/${wId}/invitations`;
  return qs ? `${base}?${qs}` : base;
}

describe("GET /api/w/:wId/invitations", () => {
  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await honoApp.request(invitationsUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns pending invitations for the workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "pending-1@example.com",
      status: "pending",
    });
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "pending-2@example.com",
      status: "pending",
      initialRole: "admin",
    });
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "revoked@example.com",
      status: "revoked",
    });

    const response = await honoApp.request(invitationsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    const emails = data.invitations.map(
      (i: { inviteEmail: string }) => i.inviteEmail
    );
    expect(emails).toHaveLength(2);
    expect(emails).toContain("pending-1@example.com");
    expect(emails).toContain("pending-2@example.com");
  });

  it("hides expired invitations by default and includes them with includeExpired=true", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "fresh@example.com",
      status: "pending",
    });
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "expired@example.com",
      status: "pending",
      createdAt: eightDaysAgo,
    });

    const defaultResponse = await honoApp.request(
      invitationsUrl(workspace.sId)
    );
    expect(defaultResponse.status).toBe(200);
    const defaultData = await defaultResponse.json();
    const defaultEmails = defaultData.invitations.map(
      (i: { inviteEmail: string }) => i.inviteEmail
    );
    expect(defaultEmails).toEqual(["fresh@example.com"]);

    const allResponse = await honoApp.request(
      invitationsUrl(workspace.sId, { includeExpired: "true" })
    );
    expect(allResponse.status).toBe(200);
    const allData = await allResponse.json();
    const allEmails = allData.invitations.map(
      (i: { inviteEmail: string }) => i.inviteEmail
    );
    expect(allEmails).toHaveLength(2);
    expect(allEmails).toContain("fresh@example.com");
    expect(allEmails).toContain("expired@example.com");
  });
});

describe("POST /api/w/:wId/invitations", () => {
  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await honoApp.request(invitationsUrl(workspace.sId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ email: "x@example.com", role: "user" }]),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("creates invitations for multiple new emails in a single request", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await honoApp.request(invitationsUrl(workspace.sId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { email: "new-user-1@example.com", role: "user" },
        { email: "new-user-2@example.com", role: "builder" },
        { email: "new-user-3@example.com", role: "admin" },
      ]),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
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

  it("returns 400 when the body is not an array of invitations", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await honoApp.request(invitationsUrl(workspace.sId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@example.com", role: "user" }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid email addresses without creating any invitation", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await honoApp.request(invitationsUrl(workspace.sId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { email: "valid@example.com", role: "user" },
        { email: "not-an-email", role: "user" },
      ]),
    });

    expect(response.status).toBe(400);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invitations =
      await MembershipInvitationResource.getPendingInvitations(adminAuth);
    expect(invitations).toHaveLength(0);
    expect(sgSendMock).not.toHaveBeenCalled();
  });
});
