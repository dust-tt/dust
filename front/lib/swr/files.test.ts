import {
  fetchFileHeadMetadataFromPath,
  fetchFileIdFromPath,
  getFilePathContentApiPath,
} from "@app/lib/swr/files";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import {
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
  frameV2ContentType,
} from "@app/types/files";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientFetch = vi.fn();
vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));

const owner = LightWorkspaceFactory.build({ sId: "w_test_ws" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("file path API", () => {
  it("encodes each scoped path segment", () => {
    const canonicalPath = "conversation-c1/reports/frame draft@2.tsx";

    expect(getFilePathContentApiPath(owner, canonicalPath)).toBe(
      "/api/w/w_test_ws/files/path/conversation-c1/reports/frame%20draft%402.tsx"
    );
  });
});

describe("file path HEAD metadata", () => {
  it("fetches linked file metadata with HEAD", async () => {
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          [DUST_FILE_CONTENT_TYPE_HEADER]: frameV2ContentType,
          [DUST_FILE_ID_HEADER]: "fil_frame",
          "Content-Type": "text/plain",
        },
      })
    );

    await expect(
      fetchFileHeadMetadataFromPath({
        owner,
        filePath: "conversation-c1/frame.tsx",
      })
    ).resolves.toEqual({
      fileId: "fil_frame",
      contentType: frameV2ContentType,
    });
    expect(mockClientFetch).toHaveBeenCalledWith(
      "/api/w/w_test_ws/files/path/conversation-c1/frame.tsx?metadata=1",
      { method: "HEAD" }
    );
  });

  it("keeps the file-id-only helper backward compatible", async () => {
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          [DUST_FILE_CONTENT_TYPE_HEADER]: frameV2ContentType,
          [DUST_FILE_ID_HEADER]: "fil_frame",
          "Content-Type": "text/plain",
        },
      })
    );

    await expect(
      fetchFileIdFromPath({
        owner,
        filePath: "conversation-c1/frame.tsx",
      })
    ).resolves.toBe("fil_frame");
  });

  it("returns null for a missing path", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      fetchFileIdFromPath({
        owner,
        filePath: "conversation-c1/missing.tsx",
      })
    ).resolves.toBeNull();
    expect(mockClientFetch).toHaveBeenCalledOnce();
  });

  it("returns null when the path has no linked file", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      fetchFileIdFromPath({
        owner,
        filePath: "conversation-c1/unlinked.tsx",
      })
    ).resolves.toBeNull();
  });

  it("throws for unexpected responses", async () => {
    mockClientFetch.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      fetchFileIdFromPath({
        owner,
        filePath: "conversation-c1/frame.tsx",
      })
    ).rejects.toThrow("Failed to fetch file metadata (HTTP 500).");
  });
});
