import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDelete,
  mockFetchFileContent,
  mockFetch,
  mockGetBucketInstance,
  mockGetEgressPolicyBucket,
  mockGetEgressProxyInternalUrl,
  mockMintEgressInvalidationJwt,
  mockUploadRawContentToBucket,
} = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockFetchFileContent: vi.fn(),
  mockFetch: vi.fn(),
  mockGetBucketInstance: vi.fn(),
  mockGetEgressPolicyBucket: vi.fn(),
  mockGetEgressProxyInternalUrl: vi.fn(),
  mockMintEgressInvalidationJwt: vi.fn(),
  mockUploadRawContentToBucket: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressPolicyBucket: mockGetEgressPolicyBucket,
    getEgressProxyInternalUrl: mockGetEgressProxyInternalUrl,
  },
}));

vi.mock("@app/lib/api/sandbox/egress", () => ({
  mintEgressInvalidationJwt: mockMintEgressInvalidationJwt,
}));

vi.mock("@app/lib/file_storage", () => ({
  getBucketInstance: mockGetBucketInstance,
}));

import {
  addOwnerPolicyDomain,
  deleteOwnerPolicy,
  deleteWorkspacePolicy,
  parseExactEgressDomain,
  readOwnerPolicy,
  readWorkspacePolicy,
  writeWorkspacePolicy,
} from "./egress_policy";

const mockAuth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-sid" }),
} as unknown as Authenticator;

const WORKSPACE_PATH = "w/workspace-sid/sandbox-egress-policy.json";
const LEGACY_WORKSPACE_PATH = "workspaces/workspace-sid.json";
const OWNER_PATH = "w/workspace-sid/sandboxes/owner-sid.json";

const NOT_FOUND = { code: 404 };

function setupBucketMocks() {
  mockGetEgressPolicyBucket.mockReturnValue("egress-policy-bucket");
  mockGetEgressProxyInternalUrl.mockReturnValue("https://egress-proxy");
  mockMintEgressInvalidationJwt.mockReturnValue("invalidation-token");
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", mockFetch);
  mockUploadRawContentToBucket.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockGetBucketInstance.mockReturnValue({
    delete: mockDelete,
    fetchFileContent: mockFetchFileContent,
    uploadRawContentToBucket: mockUploadRawContentToBucket,
  });
}

// Path-aware GCS stub: absent paths reject like GCS 404s.
function setGcsObjects(objects: Record<string, { allowedDomains: string[] }>) {
  mockFetchFileContent.mockImplementation(async (filePath: string) => {
    const policy = objects[filePath];
    if (!policy) {
      throw NOT_FOUND;
    }
    return JSON.stringify(policy);
  });
}

describe("workspace egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBucketMocks();
  });

  it("reads the workspace policy from the new layout", async () => {
    setGcsObjects({
      [WORKSPACE_PATH]: { allowedDomains: ["API.GitHub.COM"] },
    });

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: ["api.github.com"] }));
    expect(mockFetchFileContent).toHaveBeenCalledWith(WORKSPACE_PATH);
  });

  it("falls back to the legacy path when the new object is absent", async () => {
    setGcsObjects({
      [LEGACY_WORKSPACE_PATH]: { allowedDomains: ["legacy.example.com"] },
    });

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: ["legacy.example.com"] }));
    expect(mockFetchFileContent).toHaveBeenCalledWith(WORKSPACE_PATH);
    expect(mockFetchFileContent).toHaveBeenCalledWith(LEGACY_WORKSPACE_PATH);
  });

  it("prefers the new layout over the legacy path when both exist", async () => {
    setGcsObjects({
      [WORKSPACE_PATH]: { allowedDomains: ["new.example.com"] },
      [LEGACY_WORKSPACE_PATH]: { allowedDomains: ["legacy.example.com"] },
    });

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: ["new.example.com"] }));
    expect(mockFetchFileContent).not.toHaveBeenCalledWith(
      LEGACY_WORKSPACE_PATH
    );
  });

  it("returns an empty policy when neither layout has a file", async () => {
    setGcsObjects({});

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("writes normalized policy files to both layouts", async () => {
    const result = await writeWorkspacePolicy(mockAuth, {
      policy: {
        allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
      },
    });

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com", "*.github.com"],
      })
    );
    const content = JSON.stringify({
      allowedDomains: ["api.github.com", "*.github.com"],
    });
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content,
      contentType: "application/json",
      filePath: WORKSPACE_PATH,
    });
    // Dual-write to the legacy path for front rollback safety.
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content,
      contentType: "application/json",
      filePath: LEGACY_WORKSPACE_PATH,
    });
  });

  it("succeeds when only the legacy dual-write fails", async () => {
    mockUploadRawContentToBucket.mockImplementation(
      async ({ filePath }: { filePath: string }) => {
        if (filePath === LEGACY_WORKSPACE_PATH) {
          throw new Error("legacy write failed");
        }
      }
    );

    const result = await writeWorkspacePolicy(mockAuth, {
      policy: { allowedDomains: ["api.github.com"] },
    });

    expect(result).toEqual(new Ok({ allowedDomains: ["api.github.com"] }));
  });

  it("does not write invalid domain entries", async () => {
    const result = await writeWorkspacePolicy(mockAuth, {
      policy: {
        allowedDomains: ["127.0.0.1"],
      },
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("deletes both layouts and ignores missing objects", async () => {
    const result = await deleteWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith(WORKSPACE_PATH, {
      ignoreNotFound: true,
    });
    expect(mockDelete).toHaveBeenCalledWith(LEGACY_WORKSPACE_PATH, {
      ignoreNotFound: true,
    });
  });
});

describe("owner egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBucketMocks();
  });

  it("reads owner policy files from the workspace-prefixed path", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["API.GitHub.COM"] },
    });

    const result = await readOwnerPolicy(mockAuth, "owner-sid");

    expect(result).toEqual(new Ok({ allowedDomains: ["api.github.com"] }));
    expect(mockFetchFileContent).toHaveBeenCalledWith(OWNER_PATH);
  });

  it("returns an empty policy when the owner file is missing", async () => {
    setGcsObjects({});

    const result = await readOwnerPolicy(mockAuth, "owner-sid");

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("normalizes a domain and appends it to the existing owner policy", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["api.github.com"] },
    });

    const result = await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "Registry.NPMJS.org",
    });

    expect(result).toEqual(
      new Ok({
        policy: {
          allowedDomains: ["api.github.com", "registry.npmjs.org"],
        },
        addedDomain: "registry.npmjs.org",
      })
    );
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({
        allowedDomains: ["api.github.com", "registry.npmjs.org"],
      }),
      contentType: "application/json",
      filePath: OWNER_PATH,
    });
  });

  it("reports addedDomain as null when the domain is already allowed", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["api.github.com"] },
    });

    const result = await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "API.GitHub.COM",
    });

    expect(result).toEqual(
      new Ok({
        policy: { allowedDomains: ["api.github.com"] },
        addedDomain: null,
      })
    );
  });

  it("creates owner policy files from an empty start", async () => {
    setGcsObjects({});

    const result = await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "example.org",
    });

    expect(result).toEqual(
      new Ok({
        policy: { allowedDomains: ["example.org"] },
        addedDomain: "example.org",
      })
    );
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({ allowedDomains: ["example.org"] }),
      contentType: "application/json",
      filePath: OWNER_PATH,
    });
  });

  it("rejects wildcard domains for owner policy additions", async () => {
    const result = await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "*.example.org",
    });

    expect(result.isErr()).toBe(true);
    expect(mockFetchFileContent).not.toHaveBeenCalled();
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("rejects owner policies over the domain cap", async () => {
    const existingDomains = Array.from(
      { length: 100 },
      (_, i) => `domain-${i}.example.com`
    );
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: existingDomains },
    });

    const result = await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "overflow.example.com",
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("invalidates the owner policy cache with workspace and owner", async () => {
    setGcsObjects({});

    await addOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "example.org",
    });

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "https://egress-proxy/invalidate-policy",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer invalidation-token",
          },
          method: "POST",
        })
      );
    });
    expect(mockMintEgressInvalidationJwt).toHaveBeenCalledWith({
      workspaceId: "workspace-sid",
      ownerId: "owner-sid",
    });
  });

  it("deletes owner policy files and invalidates cache", async () => {
    const result = await deleteOwnerPolicy(mockAuth, "owner-sid");

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith(OWNER_PATH, {
      ignoreNotFound: true,
    });
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "https://egress-proxy/invalidate-policy",
        expect.anything()
      );
    });
  });

  it("parses exact domains and rejects malformed entries", () => {
    expect(parseExactEgressDomain("API.GitHub.COM")).toEqual(
      new Ok("api.github.com")
    );
    expect(parseExactEgressDomain("127.0.0.1").isErr()).toBe(true);
    expect(parseExactEgressDomain("*.github.com").isErr()).toBe(true);
  });
});
