import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeAll, describe, expect, it, vi } from "vitest";

import handler from "./join";

// Mock region redirect to always return null (same region).
vi.mock("@app/lib/api/regions/lookup", () => ({
  getWorkspaceRegionRedirect: vi.fn().mockResolvedValue(null),
}));

// Mock WorkOS user lookup — use importOriginal to preserve other exports
// (e.g. getWorkOSSession used by withLogging).
vi.mock(import("@app/lib/api/workos/user"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchUsersFromWorkOSWithEmails: vi.fn().mockResolvedValue([]),
  };
});

// Mock getSignInUrl.
vi.mock("@app/lib/signup", () => ({
  getSignInUrl: vi.fn().mockReturnValue("https://sign-in-url.test"),
}));

beforeAll(() => {
  // Set a test secret for JWT token signing/verification.
  process.env.DUST_INVITE_TOKEN_SECRET = "test-secret-for-invite-tokens";
});

function createJoinRequest(wId: string, query: Record<string, string> = {}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { wId, ...query },
    headers: {},
  });
  return { req, res };
}

describe("GET /api/w/[wId]/join", () => {
  it("returns 405 for non-GET methods", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: workspace.sId },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 404 for unknown workspace", async () => {
    const { req, res } = createJoinRequest("nonexistent-workspace-id");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("workspace_not_found");
  });

  it("returns 200 with join data for a valid invite token", async () => {
    const workspace = await WorkspaceFactory.basic();

    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "test@example.com",
    });

    const token = getMembershipInvitationToken(invitation.toJSON());

    const { req, res } = createJoinRequest(workspace.sId, { t: token });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.onboardingType).toBe("email_invite");
    expect(data.workspace.sId).toBe(workspace.sId);
    expect(data.signInUrl).toBeDefined();
  });

  it("returns 400 with redirectUrl for an invalid (mangled) token", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Simulate a token mangled by corporate email security (not a valid JWT).
    const mangledToken = "flWucTdvBvWVHmV4AvVfVaE8.flWgMJ4vMKWmbTyjFJ85.xxx";

    const { req, res } = createJoinRequest(workspace.sId, {
      t: mangledToken,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.redirectUrl).toBeDefined();
    expect(data.redirectUrl).toContain("reason%3Dinvalid_invitation_token");
  });

  it("returns 400 with redirectUrl for an expired invitation", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Create an invitation that is older than INVITATION_EXPIRATION_TIME_SEC
    // (7 days) but use a recent createdAt for the JWT so it doesn't fail JWT
    // verification before reaching the expiration check.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "expired@example.com",
      createdAt: eightDaysAgo,
    });

    // Generate a token with a recent iat/exp so JWT verification passes,
    // but the invitation's createdAt is old enough to trigger expiration.
    const now = Date.now();
    const tokenPayload = invitation.toJSON();
    tokenPayload.createdAt = now;
    const token = getMembershipInvitationToken(tokenPayload);

    const { req, res } = createJoinRequest(workspace.sId, { t: token });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.redirectUrl).toBeDefined();
    expect(data.redirectUrl).toContain("reason%3Dexpired_invitation");
  });

  it("returns 404 for domain_invite_link when no auto-join domain", async () => {
    const workspace = await WorkspaceFactory.basic();

    // No token, no conversationId => domain_invite_link flow.
    const { req, res } = createJoinRequest(workspace.sId);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("workspace_not_found");
    expect(res._getJSONData().error.message).toContain("auto-join");
  });
});
