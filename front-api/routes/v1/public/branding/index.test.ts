import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockFetchFileBuffer } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn(),
  mockFetchFileBuffer: vi.fn(),
}));

function getBrandingAsset(wId: string, asset: string, version?: string) {
  const url = `/api/v1/public/branding/${wId}/${asset}${version ? `?v=${version}` : ""}`;
  return honoApp.request(url);
}

describe("GET /api/v1/public/branding/:wId/:asset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getFileContentType: mockGetFileContentType,
      fetchFileBuffer: mockFetchFileBuffer,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to the default asset for an unknown workspace", async () => {
    const res = await getBrandingAsset("unknown-workspace", "logo");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("DustHorizontalIcon");
  });

  it("redirects to the default asset for a non-entitled workspace", async () => {
    const workspace = await WorkspaceFactory.basic();

    const res = await getBrandingAsset(workspace.sId, "logo");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("DustHorizontalIcon");
  });

  it("redirects to the default asset when no custom asset is uploaded", async () => {
    const workspace = await WorkspaceFactory.withWhitelabelFrames();
    mockGetFileContentType.mockResolvedValue(new Err(new Error("not found")));

    const res = await getBrandingAsset(workspace.sId, "logo");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("DustHorizontalIcon");
  });

  it("serves the asset bytes with correct headers when a custom asset exists", async () => {
    const workspace = await WorkspaceFactory.withWhitelabelFrames();
    mockGetFileContentType.mockResolvedValue(new Ok("image/png"));
    mockFetchFileBuffer.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

    const res = await getBrandingAsset(workspace.sId, "logo", "abc123");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, immutable"
    );
  });

  it("returns 404 for an unknown asset name", async () => {
    const res = await getBrandingAsset("any-workspace", "unknown-asset");

    expect(res.status).toBe(404);
  });
});
