import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetMetadata, mockCopyFile, mockDelete } = vi.hoisted(() => ({
  mockGetMetadata: vi.fn(),
  mockCopyFile: vi.fn(),
  mockDelete: vi.fn(),
}));

describe("GET /api/w/:wId/branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ getMetadata: mockGetMetadata })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null states for all assets when none are uploaded", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetMetadata.mockRejectedValue({ code: 404 });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`);

    expect(res.status).toBe(200);
    const { branding } = await res.json();
    expect(branding.assets.logo).toBeNull();
    expect(branding.assets.favicon).toBeNull();
    expect(branding.assets.og).toBeNull();
  });

  it("returns the version when an asset exists", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    mockGetMetadata.mockResolvedValue([{ generation: "9876543210" }]);

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`);

    expect(res.status).toBe(200);
    const { branding } = await res.json();
    expect(branding.assets.logo).toEqual({ version: "9876543210" });
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`);

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/w/:wId/branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ getMetadata: mockGetMetadata })),
      copyFile: mockCopyFile,
      delete: mockDelete,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    mockCopyFile.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 when workspace is not entitled to whitelabel frames", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "logo", fileId: null }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 204 and deletes the asset when fileId is null", async () => {
    const workspace = await WorkspaceFactory.withWhitelabelFrames();
    await createPrivateApiMockRequest({ role: "admin", workspace });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "logo", fileId: null }),
    });

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(
      `w/${workspace.sId}/branding/logo`,
      { ignoreNotFound: true }
    );
  });

  it("returns 204 and copies the file when a valid fileId is given", async () => {
    const workspace = await WorkspaceFactory.withWhitelabelFrames();
    const { auth, user } = await createPrivateApiMockRequest({
      role: "admin",
      workspace,
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "image/png",
      fileName: "logo.png",
      fileSize: 1024,
      status: "ready",
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
    });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "logo", fileId: file.sId }),
    });

    expect(res.status).toBe(204);
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining(file.sId),
      `w/${workspace.sId}/branding/logo`
    );
  });

  it("returns 404 when the fileId does not exist", async () => {
    const workspace = await WorkspaceFactory.withWhitelabelFrames();
    await createPrivateApiMockRequest({ role: "admin", workspace });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "logo", fileId: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const res = await honoApp.request(`/api/w/${workspace.sId}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "logo", fileId: null }),
    });

    expect(res.status).toBe(403);
  });
});
