import { getMembershipInvitationToken } from "@app/lib/utils/invitation_token";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock region redirect to always return null (same region).
vi.mock("@app/lib/api/regions/lookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/regions/lookup")>()),
  getWorkspaceRegionRedirect: vi.fn().mockResolvedValue(null),
}));

// Mock WorkOS user lookup — use importOriginal to preserve other exports.
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

function joinRequest(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `/api/w/${wId}/join${qs ? `?${qs}` : ""}`;
  return honoApp.request(url);
}

describe("GET /api/w/:wId/join", () => {
  it("returns 404 for unknown workspace", async () => {
    const response = await joinRequest("nonexistent-workspace-id");

    expect(response.status).toBe(404);
    const data = await response.json();
    expect((data as { error: { type: string } }).error.type).toBe(
      "workspace_not_found"
    );
  });

  it("returns 200 with join data for a valid invite token", async () => {
    const workspace = await WorkspaceFactory.basic();

    const invitation = await MembershipInvitationFactory.create(workspace, {
      inviteEmail: "test@example.com",
    });

    const token = getMembershipInvitationToken(invitation.toJSON());

    const response = await joinRequest(workspace.sId, { t: token });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      onboardingType: string;
      workspace: { sId: string };
      signInUrl: string;
    };
    expect(data.onboardingType).toBe("email_invite");
    expect(data.workspace.sId).toBe(workspace.sId);
    expect(data.signInUrl).toBeDefined();
  });

  it("returns 400 with redirectUrl for an invalid (mangled) token", async () => {
    const workspace = await WorkspaceFactory.basic();

    // Simulate a token mangled by corporate email security (not a valid JWT).
    const mangledToken = "flWucTdvBvWVHmV4AvVfVaE8.flWgMJ4vMKWmbTyjFJ85.xxx";

    const response = await joinRequest(workspace.sId, { t: mangledToken });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { redirectUrl: string };
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

    const response = await joinRequest(workspace.sId, { t: token });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { redirectUrl: string };
    expect(data.redirectUrl).toBeDefined();
    expect(data.redirectUrl).toContain("reason%3Dexpired_invitation");
  });

  it("returns 404 for domain_invite_link when no auto-join domain", async () => {
    const workspace = await WorkspaceFactory.basic();

    // No token, no conversationId => domain_invite_link flow.
    const response = await joinRequest(workspace.sId);

    expect(response.status).toBe(404);
    const data = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(data.error.type).toBe("workspace_not_found");
    expect(data.error.message).toContain("auto-join");
  });
});
