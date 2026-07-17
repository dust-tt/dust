import {
  fetchFileIdFromPath,
  getFilePathContentApiPath,
} from "@app/lib/swr/files";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { DUST_FILE_ID_HEADER } from "@app/types/files";
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

describe("fetchFileIdFromPath", () => {
  it("fetches the linked file id with HEAD", async () => {
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          [DUST_FILE_ID_HEADER]: "fil_frame",
        },
      })
    );

    await expect(
      fetchFileIdFromPath({
        owner,
        filePath: "conversation-c1/frame.tsx",
      })
    ).resolves.toBe("fil_frame");
    expect(mockClientFetch).toHaveBeenCalledWith(
      "/api/w/w_test_ws/files/path/conversation-c1/frame.tsx?metadata=1",
      { method: "HEAD" }
    );
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
