import { generateFrameOtpChallenge } from "@app/lib/api/share/frame_sharing";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import {
  ExternalViewerSessionModel,
  SharingGrantModel,
} from "@app/lib/resources/storage/models/files";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./verify-code";

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const { Ok } = await import("@app/types/shared/result");
  const mod = await importOriginal<typeof import("@app/lib/api/email")>();
  return {
    ...mod,
    sendEmailWithTemplate: vi.fn().mockResolvedValue(new Ok(undefined)),
  };
});

const VIEWER_EMAIL = "viewer@example.com";

describe("POST /api/v1/public/frames/[token]/verify-code", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;
  let user: UserResource;
  let file: FileResource;
  let shareToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const result = await createResourceTest({ role: "user" });
    workspace = result.workspace;
    auth = result.authenticator;
    user = result.user;

    file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.html",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    await file.setShareScope(auth, "emails_only");
    await file.addSharingGrants(auth, { emails: [VIEWER_EMAIL] });

    const shareInfo = await file.getShareInfo();
    assert(shareInfo, "Share info should be available");
    shareToken = shareInfo.shareUrl.split("/").at(-1)!;
  });

  it("returns 200 and sets dust_frame_session cookie on valid code", async () => {
    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const cookie = res.getHeader("Set-Cookie");
    expect(cookie).toBeDefined();
    expect(String(cookie)).toContain("dust_frame_session=");

    const sessions = await ExternalViewerSessionModel.findAll({
      where: { workspaceId: workspace.id, email: VIEWER_EMAIL },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].email).toBe(VIEWER_EMAIL);
  });

  it("returns 401 on invalid code", async () => {
    await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code: "000000" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 410 on expired code (no OTP generated)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code: "123456" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(410);
  });

  it("returns 403 when email has no active grant", async () => {
    const ungrantedEmail = "noaccess@example.com";

    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: ungrantedEmail,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: ungrantedEmail, code },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("returns 404 for invalid share token", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: "00000000-0000-0000-0000-000000000000" },
      body: { email: VIEWER_EMAIL, code: "123456" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 404 for scope that does not require email verification (anti-enumeration)", async () => {
    // Change scope via the Resource method.
    await file.setShareScope(auth, "public");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code: "123456" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 400 for invalid body (missing code)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid body (code wrong length)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code: "12" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 405 for non-POST method", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token: shareToken },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("creates session without shareableFileId (workspace-scoped)", async () => {
    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const sessions = await ExternalViewerSessionModel.findAll({
      where: { workspaceId: workspace.id, email: VIEWER_EMAIL },
    });
    expect(sessions).toHaveLength(1);

    const session = sessions[0].get({ plain: true });
    expect(session).not.toHaveProperty("shareableFileId");
  });

  it("returns 429 after 5 wrong attempts", async () => {
    await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });

    for (let i = 0; i < 5; i++) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { token: shareToken },
        body: { email: VIEWER_EMAIL, code: "000000" },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(401);
    }

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code: "999999" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(429);
  });

  it("does not leak grant existence on direct probe (no OTP generated)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: "attacker-probe@example.com", code: "123456" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(410);
  });

  it("returns 403 when grant is revoked after OTP generation", async () => {
    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    // Revoke the grant between OTP generation and code submission.
    await SharingGrantModel.update(
      { revokedAt: new Date() },
      {
        where: {
          workspaceId: workspace.id,
          email: VIEWER_EMAIL,
        },
      }
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: shareToken },
      body: { email: VIEWER_EMAIL, code },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });
});
