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
  addSandboxPolicyDomain,
  deleteSandboxPolicy,
  deleteWorkspacePolicy,
  parseExactEgressDomain,
  readSandboxPolicy,
  readWorkspacePolicy,
  writeWorkspacePolicy,
} from "./egress_policy";

const mockAuth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-sid" }),
} as unknown as Authenticator;

describe("workspace egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressPolicyBucket.mockReturnValue("egress-policy-bucket");
    mockGetEgressProxyInternalUrl.mockReturnValue("https://egress-proxy");
    mockMintEgressInvalidationJwt.mockReturnValue("invalidation-token");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: ["API.GitHub.COM"] })
    );
    mockUploadRawContentToBucket.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockGetBucketInstance.mockReturnValue({
      delete: mockDelete,
      fetchFileContent: mockFetchFileContent,
      uploadRawContentToBucket: mockUploadRawContentToBucket,
    });
  });

  it("reads workspace policy files from the workspace prefix", async () => {
    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com"],
      })
    );
    expect(mockGetBucketInstance).toHaveBeenCalledWith("egress-policy-bucket");
    expect(mockFetchFileContent).toHaveBeenCalledWith(
      "workspaces/workspace-sid.json"
    );
  });

  it("returns an empty policy when the workspace policy file is missing", async () => {
    mockFetchFileContent.mockRejectedValue({ code: 404 });

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("writes normalized workspace policy files", async () => {
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
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({
        allowedDomains: ["api.github.com", "*.github.com"],
      }),
      contentType: "application/json",
      filePath: "workspaces/workspace-sid.json",
    });
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

  it("deletes workspace policy files and ignores missing objects", async () => {
    const result = await deleteWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith("workspaces/workspace-sid.json", {
      ignoreNotFound: true,
    });
  });
});

describe("sandbox egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressPolicyBucket.mockReturnValue("egress-policy-bucket");
    mockGetEgressProxyInternalUrl.mockReturnValue("https://egress-proxy");
    mockMintEgressInvalidationJwt.mockReturnValue("invalidation-token");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: ["API.GitHub.COM"] })
    );
    mockUploadRawContentToBucket.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockGetBucketInstance.mockReturnValue({
      delete: mockDelete,
      fetchFileContent: mockFetchFileContent,
      uploadRawContentToBucket: mockUploadRawContentToBucket,
    });
  });

  it("reads sandbox policy files from the sandbox prefix", async () => {
    const result = await readSandboxPolicy("provider-id");

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com"],
      })
    );
    expect(mockFetchFileContent).toHaveBeenCalledWith(
      "sandboxes/provider-id.json"
    );
  });

  it("returns an empty policy when the sandbox policy file is missing", async () => {
    mockFetchFileContent.mockRejectedValue({ code: 404 });

    const result = await readSandboxPolicy("provider-id");

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("normalizes a sandbox domain and appends it to the existing policy", async () => {
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: ["api.github.com"] })
    );

    const result = await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
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
      filePath: "sandboxes/provider-id.json",
    });
  });

  it("reports addedDomain as null when the domain is already allowed", async () => {
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: ["api.github.com"] })
    );

    const result = await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
      domain: "API.GitHub.COM",
    });

    expect(result).toEqual(
      new Ok({
        policy: { allowedDomains: ["api.github.com"] },
        addedDomain: null,
      })
    );
  });

  it("creates sandbox policy files from an empty start", async () => {
    mockFetchFileContent.mockRejectedValue({ code: 404 });

    const result = await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
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
      filePath: "sandboxes/provider-id.json",
    });
  });

  it("rejects wildcard domains for sandbox policy additions", async () => {
    const result = await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
      domain: "*.example.org",
    });

    expect(result.isErr()).toBe(true);
    expect(mockFetchFileContent).not.toHaveBeenCalled();
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("rejects sandbox policies over the domain cap", async () => {
    const existingDomains = Array.from(
      { length: 100 },
      (_, i) => `domain-${i}.example.com`
    );
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: existingDomains })
    );

    const result = await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
      domain: "overflow.example.com",
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("invalidates the sandbox policy cache after writes", async () => {
    await addSandboxPolicyDomain(mockAuth, {
      sandboxProviderId: "provider-id",
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
      sandboxId: "provider-id",
    });
  });

  it("deletes sandbox policy files and invalidates cache", async () => {
    const result = await deleteSandboxPolicy("provider-id");

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith("sandboxes/provider-id.json", {
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
