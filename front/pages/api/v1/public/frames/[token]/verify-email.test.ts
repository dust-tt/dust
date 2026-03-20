import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { FileShareScope } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import assert from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/email")>();
  return {
    ...mod,
    sendEmailWithTemplate: vi.fn().mockResolvedValue({ isOk: () => true }),
  };
});

import { sendEmailWithTemplate } from "@app/lib/api/email";

import handler from "./verify-email";

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

  it("returns 200 and sends email for valid email with active grant", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["test@example.com"] });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: { email: "test@example.com" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).toHaveBeenCalledOnce();
  });

  it("returns 200 but does NOT send email for email without active grant", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: { email: "nogrant@example.com" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 200 for invalid/unknown share token (anti-enumeration)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token: "00000000-0000-0000-0000-000000000000" },
      body: { email: "test@example.com" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 200 for scope that does not require email verification (anti-enumeration)", async () => {
    const { token } = await createFrameWithScope(auth, user, "workspace");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: { email: "test@example.com" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(vi.mocked(sendEmailWithTemplate)).not.toHaveBeenCalled();
  });

  it("returns 400 for missing email in request body", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid email format", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: { email: "not-an-email" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for non-POST method", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token: "00000000-0000-0000-0000-000000000000" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error.type).toBe("method_not_supported_error");
  });

  it("normalizes email to lowercase before grant lookup", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["test@example.com"] });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { token },
      body: { email: "Test@Example.COM" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(vi.mocked(sendEmailWithTemplate)).toHaveBeenCalledOnce();
  });
});
