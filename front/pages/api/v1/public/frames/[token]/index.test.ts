import { getAuthForSharedEndpointWorkspaceMembersOnly } from "@app/lib/api/auth_wrappers";
import { createFrameSession } from "@app/lib/api/share/frame_session";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import {
  ExternalViewerSessionModel,
  SharingGrantModel,
} from "@app/lib/resources/storage/models/files";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { FileShareScope } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

// Mock auth wrapper to control authentication per test.
vi.mock("@app/lib/api/auth_wrappers", () => ({
  getAuthForSharedEndpointWorkspaceMembersOnly: vi.fn(),
}));

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

  describe("workspace_and_emails scope", () => {
    it("allows logged-in workspace member without a grant", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        auth
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toHaveProperty("accessToken");
    });

    it("allows external viewer with valid session and grant", async () => {
      const { file, token } = await createFrameWithScope(
        "workspace_and_emails"
      );
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const sessionToken = await createGrantAndSession(
        file,
        "external@example.com"
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: sessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("returns 404 for unauthenticated user without session", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("blocks Dust user from another workspace even with a grant (must use OTP)", async () => {
      const { file, token } = await createFrameWithScope(
        "workspace_and_emails"
      );
      // User is logged into Dust but NOT a member of this workspace.
      // getAuthForSharedEndpointWorkspaceMembersOnly returns null.
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      // Grant exists for their email, but they can't prove email ownership
      // without workspace membership — they must go through OTP.
      await file.addSharingGrants(auth, {
        emails: ["other-workspace-user@example.com"],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });

  // -- emails_only: only users with a grant (Dust session or external session) can access --

  describe("emails_only scope", () => {
    it("allows logged-in workspace member whose email has an active grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        auth
      );

      // Grant access to the logged-in user's email.
      await file.addSharingGrants(auth, { emails: [user.email] });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("blocks logged-in workspace member whose email has no grant", async () => {
      const { token } = await createFrameWithScope("emails_only");
      // User IS authenticated but has no grant.
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        auth
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("allows external viewer with valid session and grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const sessionToken = await createGrantAndSession(
        file,
        "viewer@example.com"
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: sessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("blocks session with valid cookie but revoked grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

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

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: sessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("blocks session for wrong email (session email differs from grant email)", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

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

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: bobSessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("blocks expired session even with valid grant", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

      // Create an expired session directly.
      const sessionToken = crypto.randomUUID();
      await ExternalViewerSessionModel.create({
        sessionToken,
        email: "viewer@example.com",
        expiresAt: new Date(Date.now() - 1000), // Expired.
        workspaceId: workspace.id,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: sessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("updates lastViewedAt on the grant when access is granted", async () => {
      const { file, token } = await createFrameWithScope("emails_only");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

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

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });
      req.cookies = { dust_frame_session: match![1] };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      await grant!.reload();
      expect(grant!.lastViewedAt).not.toBeNull();
    });

    it("session covers multiple frames in the same workspace", async () => {
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

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
      const { req: req1, res: res1 } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "GET",
        query: { token: frame1Token },
      });
      req1.cookies = { dust_frame_session: sessionToken };
      await handler(req1, res1);
      expect(res1._getStatusCode()).toBe(200);

      // Same session accesses frame 2.
      const { req: req2, res: res2 } = createMocks<
        NextApiRequest,
        NextApiResponse
      >({
        method: "GET",
        query: { token: frame2Token },
      });
      req2.cookies = { dust_frame_session: sessionToken };
      await handler(req2, res2);
      expect(res2._getStatusCode()).toBe(200);
    });
  });

  describe("workspace scope", () => {
    it("returns 404 when user is not authenticated", async () => {
      const { token } = await createFrameWithScope("workspace");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("returns 200 for authenticated workspace member", async () => {
      const { token } = await createFrameWithScope("workspace");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        auth
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toHaveProperty("accessToken");
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
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const sessionToken = await createGrantAndSession(
        file,
        "viewer@example.com"
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });
      req.cookies = { dust_frame_session: sessionToken };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("still allows authenticated workspace member", async () => {
      const { token } = await createFrameWithScope("workspace_and_emails");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        auth
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe("public scope", () => {
    it("returns 200 without any authentication", async () => {
      const { token } = await createFrameWithScope("public");
      vi.mocked(getAuthForSharedEndpointWorkspaceMembersOnly).mockResolvedValue(
        null
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { token: token },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });
});
