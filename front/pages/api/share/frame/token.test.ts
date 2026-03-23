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

import handler from "./[token]";

async function createFrameWithScope(
  auth: Authenticator,
  user: UserResource,
  scope: FileShareScope
) {
  const file = await FileFactory.create(auth, user, {
    contentType: frameContentType,
    fileName: "test.html",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
  });

  await file.setShareScope(auth, scope);

  const shareInfo = await file.getShareInfo();
  assert(shareInfo, "Share info should be available");
  const token = shareInfo.shareUrl.split("/").at(-1)!;

  return { file, token };
}

describe("GET /api/share/frame/[token] - requiresEmailVerification", () => {
  let auth: Authenticator;
  let user: UserResource;

  beforeEach(async () => {
    const resources = await createResourceTest({ role: "admin" });
    auth = resources.authenticator;
    user = resources.user;
  });

  it("returns false for workspace_and_emails with no grants", async () => {
    const { token } = await createFrameWithScope(
      auth,
      user,
      "workspace_and_emails"
    );

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(false);
  });

  it("returns true for workspace_and_emails with active grants", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "workspace_and_emails"
    );

    await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(true);
  });

  it("returns false for emails_only with no grants", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(false);
  });

  it("returns true for emails_only with active grants", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(true);
  });

  it("returns false for public scope", async () => {
    const { token } = await createFrameWithScope(auth, user, "public");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(false);
  });

  it("returns false for legacy workspace scope", async () => {
    const { token } = await createFrameWithScope(auth, user, "workspace");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { token },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().requiresEmailVerification).toBe(false);
  });
});
