import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SharingGrantFactory } from "@app/tests/utils/SharingGrantFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { FileShareScope } from "@app/types/files";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
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

// Mock resolveOptionalAuth to control authentication per test.
vi.mock("@front-api/routes/v1/public/frames/shared_auth", () => ({
  resolveOptionalAuth: vi.fn().mockResolvedValue(null),
}));

import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";

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

  it("offers verification for a domain-only share until the grant is revoked", async () => {
    const { file, token } = await createFrameWithScope(
      auth,
      user,
      "emails_only"
    );
    const grant = await SharingGrantFactory.create(auth, file, {
      kind: "domain",
      value: "example.com",
    });
    expect(
      (await (await getShareFrame(token)).json()).requiresEmailVerification
    ).toBe(true);
    expect((await grant.revoke()).isOk()).toBe(true);
    expect(
      (await (await getShareFrame(token)).json()).requiresEmailVerification
    ).toBe(false);
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

describe("GET /api/share/frame/:token - Frame v2 function gating", () => {
  let auth: Authenticator;
  let user: UserResource;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    vi.mocked(resolveOptionalAuth).mockResolvedValue(null);
    const resources = await createResourceTest({ role: "admin" });
    auth = resources.authenticator;
    user = resources.user;
    workspace = resources.workspace;
  });

  const createFrameV2WithFunction = async (scope: FileShareScope) => {
    const space = await SpaceFactory.project(workspace, user.id);
    const { frame } = await createTestFrameFunction(auth, { space });
    await frame.setShareScope(auth, scope);

    const shareInfo = await frame.getShareInfo();
    assert(shareInfo, "Share info should be available");
    const token = shareInfo.shareUrl.split("/").at(-1);
    assert(token, "Share URL should end with a token");

    return { frame, token };
  };

  const createFrameV2WithoutFunction = async (scope: FileShareScope) => {
    const space = await SpaceFactory.project(workspace, user.id);
    const frame = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: space.sId,
        activePublicationId: "publication-1",
      },
    });
    await frame.setShareScope(auth, scope);

    const shareInfo = await frame.getShareInfo();
    assert(shareInfo, "Share info should be available");
    const token = shareInfo.shareUrl.split("/").at(-1);
    assert(token, "Share URL should end with a token");

    return { frame, token };
  };

  it("returns 404 for an anonymous viewer of a public frame", async () => {
    const { token } = await createFrameV2WithFunction("public");

    const response = await getShareFrame(token);

    expect(response.status).toBe(404);
  });

  it("returns 404 rather than offering email verification", async () => {
    const { frame, token } = await createFrameV2WithFunction("emails_only");
    await frame.addSharingGrants(auth, { emails: ["viewer@example.com"] });

    const response = await getShareFrame(token);

    expect(response.status).toBe(404);
  });

  it("returns 200 for an authenticated workspace member", async () => {
    const { token } = await createFrameV2WithFunction("workspace_and_emails");
    vi.mocked(resolveOptionalAuth).mockResolvedValue(auth);

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
  });

  it("stays public for a legacy Frame", async () => {
    const { token } = await createFrameWithScope(auth, user, "public");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
  });

  it("stays public for a Frame v2 declaring no function", async () => {
    const { token } = await createFrameV2WithoutFunction("public");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
  });

  it("stays public once the active publication declares no function", async () => {
    const { frame, token } = await createFrameV2WithFunction("public");
    await frame.setUseCaseMetadata(auth, {
      ...frame.useCaseMetadata,
      activePublicationId: "publication-2",
    });

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
  });
});

describe("GET /api/share/frame/:token - title", () => {
  let auth: Authenticator;
  let user: UserResource;

  beforeEach(async () => {
    const resources = await createResourceTest({ role: "admin" });
    auth = resources.authenticator;
    user = resources.user;
  });

  it("uses the formatted file name for a legacy Frame", async () => {
    const { token } = await createFrameWithScope(auth, user, "public");

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).title).toBe("Test");
  });

  it("uses the published Frame name for a Frame v2", async () => {
    const file = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        activePublicationId: "publication-1",
        frameName: "Task List",
        frameDescription: "Track tasks.",
      },
    });
    await file.setShareScope(auth, "public");
    const shareInfo = await file.getShareInfo();
    assert(shareInfo, "Share info should be available");
    const token = shareInfo.shareUrl.split("/").at(-1)!;

    const response = await getShareFrame(token);

    expect(response.status).toBe(200);
    expect((await response.json()).title).toBe("Task List");
  });
});
