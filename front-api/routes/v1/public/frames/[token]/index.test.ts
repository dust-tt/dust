import { createFrameSession } from "@app/lib/api/share/frame_session";
import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import {
  ExternalViewerSessionModel,
  SharingGrantModel,
} from "@app/lib/resources/storage/models/files";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { FileShareScope } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock resolveOptionalAuth to control authentication per test.
vi.mock("@front-api/routes/v1/public/frames/shared_auth", () => ({
  resolveOptionalAuth: vi.fn().mockResolvedValue(null),
}));

import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";

describe("GET /api/v1/public/frames/[token]", () => {
  let auth: Authenticator;
  let user: UserResource;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createResourceTest({ role: "admin" });
    auth = ctx.authenticator;
    user = ctx.user;
    workspace = ctx.workspace;
  });

  const createFrameWithScope = async (scope: FileShareScope) => {
    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.html",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    await file.setShareScope(auth, scope);

    const shareInfo = await file.getShareInfo();
    expect(shareInfo).not.toBeNull();
    const token = shareInfo!.shareUrl.split("/").at(-1)!;

    return { file, token };
  };

  const createGrantAndSession = async (file: FileResource, email: string) => {
    await file.addSharingGrants(auth, { emails: [email] });

    // Create session and extract token from the Set-Cookie header.
    const mockRes = createMocks<NextApiRequest, NextApiResponse>().res;
    await createFrameSession(mockRes, workspace, { email });

    const cookie = String(mockRes.getHeader("Set-Cookie") ?? "");
    const match = cookie.match(/dust_frame_session=([^;]+)/);
    expect(match).not.toBeNull();
    return match![1];
  };

  const requestFrame = async (
    token: string,
    opts?: { cookies?: Record<string, string> }
  ) => {
    const headers: Record<string, string> = {};
    if (opts?.cookies) {
      headers.cookie = Object.entries(opts.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    return honoApp.request(`/api/v1/public/frames/${token}`, { headers });
  };

  describe("workspace_and_emails scope", () => {
    it("allows logged-in workspace member without a grant", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("accessToken");
    });

    it("allows external viewer with valid session and grant", async () => {
      const { file, token } = await createFrameWithScope(
        "workspace_and_emails"
      );
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const sessionToken = await createGrantAndSession(
        file,
        "external@example.com"
      );

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: sessionToken },
      });

      expect(response.status).toBe(200);
    });

    it("returns 404 for unauthenticated user without session", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const response = await requestFrame(token);

      expect(response.status).toBe(404);
    });

    it("blocks Dust user from another workspace even with a grant (must use OTP)", async () => {
      const { file, token } = await createFrameWithScope(
        "workspace_and_emails"
      );
      // User is logged into Dust but NOT a member of this workspace.
      // resolveOptionalAuth returns null.
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      // Grant exists for their email, but they can't prove email ownership
      // without workspace membership — they must go through OTP.
      await file.addSharingGrants(auth, {
        emails: ["other-workspace-user@example.com"],
      });

      const response = await requestFrame(token);

      expect(response.status).toBe(404);
    });
  });

  // -- emails_only: only users with a grant (Dust session or external session) can access --

  describe("emails_only scope", () => {
    it("allows logged-in workspace member whose email has an active grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

      // Grant access to the logged-in user's email.
      await file.addSharingGrants(auth, { emails: [user.email] });

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
    });

    it("blocks logged-in non-owner workspace member whose email has no grant", async () => {
      const { token } = await createFrameWithScope("emails_only");

      // A different workspace member who is NOT the file owner.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );
      vi.mocked(resolveOptionalAuth).mockResolvedValue(otherAuth);

      const response = await requestFrame(token);

      expect(response.status).toBe(404);
    });

    it("allows the file owner without an email grant", async () => {
      // File is created by `user` and `auth` is for `user`, so `user` is the owner.
      const { token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
    });

    it("allows external viewer with valid session and grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const sessionToken = await createGrantAndSession(
        file,
        "viewer@example.com"
      );

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: sessionToken },
      });

      expect(response.status).toBe(200);
    });

    it("blocks session with valid cookie but revoked grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const sessionToken = await createGrantAndSession(
        file,
        "viewer@example.com"
      );

      // Revoke the grant.
      await SharingGrantModel.update(
        { revokedAt: new Date() },
        {
          where: {
            workspaceId: workspace.id,
            email: "viewer@example.com",
          },
        }
      );

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: sessionToken },
      });

      expect(response.status).toBe(404);
    });

    it("blocks session for wrong email (session email differs from grant email)", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      // Grant is for alice, but session is for bob.
      await file.addSharingGrants(auth, { emails: ["alice@example.com"] });

      // Create session for bob (no grant for bob).
      const mockRes = createMocks<NextApiRequest, NextApiResponse>().res;
      await createFrameSession(mockRes, workspace, {
        email: "bob@example.com",
      });
      const cookie = String(mockRes.getHeader("Set-Cookie") ?? "");
      const match = cookie.match(/dust_frame_session=([^;]+)/);
      expect(match).not.toBeNull();
      const bobSessionToken = match![1];

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: bobSessionToken },
      });

      expect(response.status).toBe(404);
    });

    it("blocks expired session even with valid grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

      // Create an expired session directly.
      const sessionToken = crypto.randomUUID();
      await ExternalViewerSessionModel.create({
        sessionToken,
        email: "viewer@example.com",
        expiresAt: new Date(Date.now() - 1000), // Expired.
        workspaceId: workspace.id,
      });

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: sessionToken },
      });

      expect(response.status).toBe(404);
    });

    it("updates lastViewedAt on the grant when access is granted", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

      // Get the grant to check lastViewedAt later.
      const grant = await SharingGrantModel.findOne({
        where: {
          workspaceId: workspace.id,
          email: "viewer@example.com",
        },
      });
      expect(grant).not.toBeNull();
      expect(grant!.lastViewedAt).toBeNull();

      const mockRes = createMocks<NextApiRequest, NextApiResponse>().res;
      await createFrameSession(mockRes, workspace, {
        email: "viewer@example.com",
      });
      const cookie = String(mockRes.getHeader("Set-Cookie") ?? "");
      const match = cookie.match(/dust_frame_session=([^;]+)/);
      expect(match).not.toBeNull();

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: match![1] },
      });

      expect(response.status).toBe(200);

      await grant!.reload();
      expect(grant!.lastViewedAt).not.toBeNull();
    });

    it("session covers multiple frames in the same workspace", async () => {
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      // Create two frames.
      const { file: file1, token: frame1Token } =
        await createFrameWithScope("emails_only");
      const { file: file2, token: frame2Token } =
        await createFrameWithScope("emails_only");

      // Grant access to both frames for the same email.
      const email = "viewer@example.com";
      await file1.addSharingGrants(auth, { emails: [email] });
      await file2.addSharingGrants(auth, { emails: [email] });

      // Create one session for this email.
      const mockRes = createMocks<NextApiRequest, NextApiResponse>().res;
      await createFrameSession(mockRes, workspace, { email });
      const cookie = String(mockRes.getHeader("Set-Cookie") ?? "");
      const match = cookie.match(/dust_frame_session=([^;]+)/);
      expect(match).not.toBeNull();
      const sessionToken = match![1];

      // Access frame 1.
      const res1 = await requestFrame(frame1Token, {
        cookies: { dust_frame_session: sessionToken },
      });
      expect(res1.status).toBe(200);

      // Same session accesses frame 2.
      const res2 = await requestFrame(frame2Token, {
        cookies: { dust_frame_session: sessionToken },
      });
      expect(res2.status).toBe(200);
    });
  });

  describe("workspace scope", () => {
    it("returns 404 when user is not authenticated", async () => {
      const { token } = await createFrameWithScope("workspace");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const response = await requestFrame(token);

      expect(response.status).toBe(404);
    });

    it("returns 200 for authenticated workspace member", async () => {
      const { token } = await createFrameWithScope("workspace");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("accessToken");
    });
  });

  describe("workspace_only policy", () => {
    beforeEach(async () => {
      await WorkspaceModel.update(
        { sharingPolicy: "workspace_only" },
        { where: { sId: workspace.sId } }
      );
    });

    it("blocks external user with a valid email grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const sessionToken = await createGrantAndSession(
        file,
        "viewer@example.com"
      );

      const response = await requestFrame(token, {
        cookies: { dust_frame_session: sessionToken },
      });

      expect(response.status).toBe(404);
    });

    it("still allows authenticated workspace member", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
    });
  });

  describe("public scope", () => {
    it("returns 200 without any authentication", async () => {
      const { token } = await createFrameWithScope("public");
      vi.mocked(resolveOptionalAuth).mockResolvedValue(null);

      const response = await requestFrame(token);

      expect(response.status).toBe(200);
    });
  });
});
