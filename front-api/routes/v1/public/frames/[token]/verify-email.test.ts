import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { FileShareScope } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/email")>();
  return {
    ...mod,
    sendEmailWithTemplate: vi.fn().mockResolvedValue({ isOk: () => true }),
  };
});

import { sendEmailWithTemplate } from "@app/lib/api/email";

async function createFrameWithScope(
  auth: Authenticator,
  user: UserResource,
  shareScope: FileShareScope
) {
  const file = await FileFactory.create(auth, user, {
    contentType: frameContentType,
    fileName: "test.html",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
  });

  await file.setShareScope(auth, shareScope);

  const shareInfo = await file.getShareInfo();
  assert(shareInfo, "Share info should be available after setting share scope");
  const token = shareInfo.shareUrl.split("/").at(-1)!;

  return { file, token };
}

describe("verify-email endpoint", () => {
  let user: UserResource;
  let auth: Authenticator;

  beforeEach(async () => {
    vi.mocked(sendEmailWithTemplate).mockClear();

    const resources = await createResourceTest({ role: "admin" });
    user = resources.user;
    auth = resources.authenticator;
  });

  const postVerifyEmail = (token: string, body: Record<string, unknown>) =>
    honoApp.request(`/api/v1/public/frames/${token}/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns 200 and sends email for valid email with active grant", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["test@example.com"] });

    // Clear mock after grant creation (which fires a share notification email).
    vi.mocked(sendEmailWithTemplate).mockClear();

    const response = await postVerifyEmail(token, {
      email: "test@example.com",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).toHaveBeenCalledOnce();
  });

  it("returns 200 but does NOT send email for email without active grant", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const response = await postVerifyEmail(token, {
      email: "nogrant@example.com",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 200 for invalid/unknown share token (anti-enumeration)", async () => {
    const response = await postVerifyEmail(
      "00000000-0000-0000-0000-000000000000",
      { email: "test@example.com" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 200 for scope that does not require email verification (anti-enumeration)", async () => {
    const { token } = await createFrameWithScope(auth, user, "workspace");

    const response = await postVerifyEmail(token, {
      email: "test@example.com",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 400 for missing email in request body", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const response = await postVerifyEmail(token, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid email format", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const response = await postVerifyEmail(token, {
      email: "not-an-email",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("normalizes email to lowercase before grant lookup", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["test@example.com"] });

    // Clear mock after grant creation (which fires a share notification email).
    vi.mocked(sendEmailWithTemplate).mockClear();

    const response = await postVerifyEmail(token, {
      email: "Test@Example.COM",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(sendEmailWithTemplate)).toHaveBeenCalledOnce();
  });
});
