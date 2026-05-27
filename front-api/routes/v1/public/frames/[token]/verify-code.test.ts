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
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  const postVerifyCode = (token: string, body: Record<string, unknown>) =>
    honoApp.request(`/api/v1/public/frames/${token}/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns 200 and sets dust_frame_session cookie on valid code", async () => {
    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const cookie = response.headers.get("Set-Cookie");
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

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code: "000000",
    });

    expect(response.status).toBe(401);
  });

  it("returns 410 on expired code (no OTP generated)", async () => {
    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code: "123456",
    });

    expect(response.status).toBe(410);
  });

  it("returns 403 when email has no active grant", async () => {
    const ungrantedEmail = "noaccess@example.com";

    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: ungrantedEmail,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const response = await postVerifyCode(shareToken, {
      email: ungrantedEmail,
      code,
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 for invalid share token", async () => {
    const response = await postVerifyCode(
      "00000000-0000-0000-0000-000000000000",
      { email: VIEWER_EMAIL, code: "123456" }
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for scope that does not require email verification (anti-enumeration)", async () => {
    // Change scope via the Resource method.
    await file.setShareScope(auth, "public");

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code: "123456",
    });

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid body (missing code)", async () => {
    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid body (code wrong length)", async () => {
    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code: "12",
    });

    expect(response.status).toBe(400);
  });

  it("creates session without shareableFileId (workspace-scoped)", async () => {
    const otpResult = await generateFrameOtpChallenge({
      shareToken,
      email: VIEWER_EMAIL,
    });
    const code = otpResult.isOk() ? otpResult.value.code : "";

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code,
    });

    expect(response.status).toBe(200);

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
      const response = await postVerifyCode(shareToken, {
        email: VIEWER_EMAIL,
        code: "000000",
      });
      expect(response.status).toBe(401);
    }

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code: "999999",
    });

    expect(response.status).toBe(429);
  });

  it("does not leak grant existence on direct probe (no OTP generated)", async () => {
    const response = await postVerifyCode(shareToken, {
      email: "attacker-probe@example.com",
      code: "123456",
    });

    expect(response.status).toBe(410);
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

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code,
    });

    expect(response.status).toBe(403);
  });
});
