import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { frameContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockFetchFileBuffer } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn(),
  mockFetchFileBuffer: vi.fn(),
}));

function getFrameOg(token: string, version?: string) {
  const url = `/api/v1/public/frames/${token}/og${version ? `?v=${version}` : ""}`;
  return honoApp.request(url);
}

describe("GET /api/v1/public/frames/:token/og", () => {
  let auth: Authenticator;
  let user: UserResource;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getFileContentType: mockGetFileContentType,
      fetchFileBuffer: mockFetchFileBuffer,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const resources = await createResourceTest({ role: "admin" });
    auth = resources.authenticator;
    user = resources.user;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createSharedFrame() {
    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "demo.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });
    await file.setShareScope(auth, "public");
    const shareInfo = await file.getShareInfo();
    assert(shareInfo, "Share info should be available");
    const token = shareInfo.shareUrl.split("/").at(-1)!;
    return { file, token };
  }

  it("returns 404 for an unknown share token", async () => {
    const res = await getFrameOg("missing-token");
    expect(res.status).toBe(404);
  });

  it("redirects to the default OG image when no preview has been stored", async () => {
    const { token } = await createSharedFrame();
    mockGetFileContentType.mockResolvedValue(new Err(new Error("not found")));

    const res = await getFrameOg(token);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/static/og/ic.png");
  });

  it("serves the Frame OG bytes with immutable cache headers", async () => {
    const { token } = await createSharedFrame();
    mockGetFileContentType.mockResolvedValue(new Ok("image/png"));
    mockFetchFileBuffer.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

    const res = await getFrameOg(token, "gen-1");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, immutable"
    );
  });
});
