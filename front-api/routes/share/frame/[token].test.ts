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

function getShareFrame(token: string) {
  return honoApp.request(`/api/share/frame/${token}`);
}

describe("GET /api/share/frame/:token - requiresEmailVerification", () => {
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

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(false);
  });

  it("returns true for workspace_and_emails with active grants", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "workspace_and_emails"
    );

    await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(true);
  });

  it("returns false for emails_only with no grants", async () => {
    const { token } = await createFrameWithScope(auth, user, "emails_only");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(false);
  });

  it("returns true for emails_only with active grants", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );

    await file.addSharingGrants(auth, { emails: ["viewer@example.com"] });

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(true);
  });

  it("returns false for public scope", async () => {
    const { token } = await createFrameWithScope(auth, user, "public");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(false);
  });

  it("returns false for legacy workspace scope", async () => {
    const { token } = await createFrameWithScope(auth, user, "workspace");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).requiresEmailVerification).toBe(false);
  });
});
