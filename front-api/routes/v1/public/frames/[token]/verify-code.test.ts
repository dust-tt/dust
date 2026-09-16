import type { Authenticator } from "@app/lib/auth";
import { ExternalViewerSessionResource } from "@app/lib/resources/external_viewer_session_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { requestFrameVerificationCode } from "@app/tests/utils/frame_verification";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
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
    await SharingGrantFactory.create(auth, file, {
      kind: "email",
      value: VIEWER_EMAIL,
    });

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

  it("issues individual domain sessions and rechecks revocation after OTP issuance", async () => {
    const grant = await SharingGrantFactory.create(auth, file, {
      kind: "domain",
      value: "example.com",
    });
    const aliceCode = await requestFrameVerificationCode({
      shareToken,
      email: "alice@example.com",
    });
    const aliceResponse = await postVerifyCode(shareToken, {
      email: "alice@example.com",
      code: aliceCode,
    });
    expect(aliceResponse.status).toBe(200);
    expect(aliceResponse.headers.get("Set-Cookie")).toContain(
      "dust_frame_session="
    );
    const bobCode = await requestFrameVerificationCode({
      shareToken,
      email: "bob@example.com",
    });
    expect((await grant.revoke(auth)).isOk()).toBe(true);
    expect(
      (
        await postVerifyCode(shareToken, {
          email: "bob@example.com",
          code: bobCode,
        })
      ).status
    ).toBe(403);
  });

  it("returns 200 and sets dust_frame_session cookie on valid code", async () => {
    const code = await requestFrameVerificationCode({
      shareToken,
      email: VIEWER_EMAIL,
    });

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toBeDefined();
    expect(String(cookie)).toContain("dust_frame_session=");

    const token = cookie?.match(/dust_frame_session=([^;]+)/)?.[1];
    assert(token);
    const session = await ExternalViewerSessionResource.fetchByToken(
      workspace,
      token
    );
    expect(session?.email).toBe(VIEWER_EMAIL);
  });

  it("returns 401 on invalid code", async () => {
    await requestFrameVerificationCode({
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

  it("returns 429 after 5 wrong attempts", async () => {
    await requestFrameVerificationCode({
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
    const code = await requestFrameVerificationCode({
      shareToken,
      email: VIEWER_EMAIL,
    });

    const grants = await SharingGrantResource.listForFile(file);
    expect((await grants[0].revoke(auth)).isOk()).toBe(true);

    const response = await postVerifyCode(shareToken, {
      email: VIEWER_EMAIL,
      code,
    });

    expect(response.status).toBe(403);
  });
});
