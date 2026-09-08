import type { Authenticator } from "@app/lib/auth";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
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

vi.mock("@app/lib/file_storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/file_storage")>();

  return {
    ...original,
    getBucketInstance: mockGetBucketInstance,
  };
});

import {
  addOwnerPolicyDomain,
  deleteOwnerPolicy,
  deleteWorkspacePolicy,
  dismissRequestedOwnerPolicyDomain,
  parseExactEgressDomain,
  readOwnerPolicy,
  readWorkspacePolicy,
  removeOwnerPolicyDomain,
  requestOwnerPolicyDomain,
  requestOwnerPolicyDomains,
  writeOwnerPolicy,
  writeWorkspacePolicy,
} from "./egress_policy";

const mockAuth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-sid" }),
} as unknown as Authenticator;

const WORKSPACE_PATH = "w/workspace-sid/sandbox-egress-policy.json";
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
function setGcsObjects(objects: Record<string, EgressPolicy>) {
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

  it("returns an empty policy when no file exists", async () => {
    setGcsObjects({});

    const result = await readWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("writes the normalized policy file", async () => {
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
    expect(mockUploadRawContentToBucket).toHaveBeenCalledTimes(1);
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({
        allowedDomains: ["api.github.com", "*.github.com"],
      }),
      contentType: "application/json",
      filePath: WORKSPACE_PATH,
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

  it("preserves a requestedDomains section when the workspace allowlist is replaced", async () => {
    setGcsObjects({
      [WORKSPACE_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    // A caller replacing the allowlist without stating the section must not
    // wipe pending requests — same contract as the owner policy write.
    const result = await writeWorkspacePolicy(mockAuth, {
      policy: { allowedDomains: ["api.github.com", "docs.github.com"] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.requestedDomains).toEqual([
        { domain: "api.stripe.com", requestedAtMs: 1 },
      ]);
    }
  });

  it("deletes the policy file and ignores missing objects", async () => {
    const result = await deleteWorkspacePolicy(mockAuth);

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(WORKSPACE_PATH, {
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

  it("removes a stored wildcard domain from an owner policy", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["*.example.com", "keep.example.org"] },
    });

    const result = await removeOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "*.example.com",
    });

    expect(result).toEqual(
      new Ok({
        policy: { allowedDomains: ["keep.example.org"] },
        removedDomain: "*.example.com",
      })
    );
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({ allowedDomains: ["keep.example.org"] }),
      contentType: "application/json",
      filePath: OWNER_PATH,
    });
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

describe("pod egress domain requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBucketMocks();
  });

  it("records a request with the normalized domain", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["api.github.com"] },
    });

    const result = await requestOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "API.Stripe.COM",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("requested");
      expect(result.value.policy.requestedDomains).toEqual([
        { domain: "api.stripe.com", requestedAtMs: expect.any(Number) },
      ]);
      expect(result.value.policy.allowedDomains).toEqual(["api.github.com"]);
    }
  });

  it("reports already_allowed without writing", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["api.stripe.com"] },
    });

    const result = await requestOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "api.stripe.com",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("already_allowed");
    }
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("dedupes an already-pending request without writing", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: [],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    const result = await requestOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "api.stripe.com",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("already_requested");
    }
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("rejects requests past the pending cap", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: [],
        requestedDomains: Array.from({ length: 50 }, (_, i) => ({
          domain: `service-${i}.example.com`,
          requestedAtMs: 1,
        })),
      },
    });

    const result = await requestOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "one-more.example.com",
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("accepts wildcard requests (every Pod grant is admin-decided)", async () => {
    setGcsObjects({ [OWNER_PATH]: { allowedDomains: [] } });

    const result = await requestOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "*.Stripe.COM",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe("requested");
      expect(result.value.policy.requestedDomains).toEqual([
        { domain: "*.stripe.com", requestedAtMs: expect.any(Number) },
      ]);
    }
  });

  it("preserves pending requests when the allowlist is replaced", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    // The admin settings PUT replaces the allowlist without stating the
    // requests section — it must survive.
    const result = await writeOwnerPolicy(mockAuth, {
      ownerId: "owner-sid",
      policy: { allowedDomains: ["api.github.com", "docs.github.com"] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.requestedDomains).toEqual([
        { domain: "api.stripe.com", requestedAtMs: 1 },
      ]);
    }
  });

  it("resolves a request atomically when its domain is approved into the allowlist", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: [],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    // Approve = append + write: one write moves the domain from requested to
    // allowed, no dedicated helper.
    const result = await writeOwnerPolicy(mockAuth, {
      ownerId: "owner-sid",
      policy: { allowedDomains: ["api.stripe.com"] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.allowedDomains).toEqual(["api.stripe.com"]);
      expect(result.value.requestedDomains).toBeUndefined();
    }
  });

  it("dismisses a pending request without granting it", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [
          { domain: "api.stripe.com", requestedAtMs: 1 },
          { domain: "api.notion.com", requestedAtMs: 2 },
        ],
      },
    });

    const result = await dismissRequestedOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "api.stripe.com",
    });

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.notion.com", requestedAtMs: 2 }],
      })
    );
  });

  it("drops malformed pending entries instead of failing the read", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [
          { domain: "not a domain!!", requestedAtMs: 1 },
          { domain: "api.stripe.com", requestedAtMs: 2 },
        ],
      },
    });

    const result = await readOwnerPolicy(mockAuth, "owner-sid");

    // A single bad request entry must not brick reads (and thereby writes)
    // of the whole policy file.
    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 2 }],
      })
    );
  });

  it("no-ops a dismiss for a domain that is not pending", async () => {
    setGcsObjects({
      [OWNER_PATH]: { allowedDomains: ["api.github.com"] },
    });

    const result = await dismissRequestedOwnerPolicyDomain(mockAuth, {
      ownerId: "owner-sid",
      domain: "api.stripe.com",
    });

    expect(result).toEqual(new Ok({ allowedDomains: ["api.github.com"] }));
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });
});

describe("pod egress domain batch requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBucketMocks();
  });

  it("classifies every domain and files the new ones in a single write", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    const result = await requestOwnerPolicyDomains(mockAuth, {
      ownerId: "owner-sid",
      domains: [
        "API.GitHub.COM",
        "api.stripe.com",
        "*.Stripe.COM",
        "hooks.slack.com",
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcomes).toEqual([
        { domain: "api.github.com", outcome: "already_allowed" },
        { domain: "api.stripe.com", outcome: "already_requested" },
        { domain: "*.stripe.com", outcome: "requested" },
        { domain: "hooks.slack.com", outcome: "requested" },
      ]);
      expect(
        result.value.policy.requestedDomains?.map((request) => request.domain)
      ).toEqual(["api.stripe.com", "*.stripe.com", "hooks.slack.com"]);
    }
    expect(mockUploadRawContentToBucket).toHaveBeenCalledTimes(1);
  });

  it("reports already_allowed for a domain the workspace allows when filing on a Pod", async () => {
    setGcsObjects({
      [WORKSPACE_PATH]: { allowedDomains: ["api.stripe.com"] },
      [OWNER_PATH]: { allowedDomains: [] },
    });

    const result = await requestOwnerPolicyDomains(mockAuth, {
      ownerId: "owner-sid",
      domains: ["api.stripe.com", "hooks.slack.com"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcomes).toEqual([
        { domain: "api.stripe.com", outcome: "already_allowed" },
        { domain: "hooks.slack.com", outcome: "requested" },
      ]);
      expect(
        result.value.policy.requestedDomains?.map((request) => request.domain)
      ).toEqual(["hooks.slack.com"]);
    }
    expect(mockUploadRawContentToBucket).toHaveBeenCalledTimes(1);
    expect(mockUploadRawContentToBucket.mock.calls[0]?.[0]).toMatchObject({
      filePath: OWNER_PATH,
    });
  });

  it("does not write when nothing new is requested", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 1 }],
      },
    });

    const result = await requestOwnerPolicyDomains(mockAuth, {
      ownerId: "owner-sid",
      domains: ["api.github.com", "api.stripe.com"],
    });

    expect(result.isOk()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when it would exceed the pending cap", async () => {
    setGcsObjects({
      [OWNER_PATH]: {
        allowedDomains: [],
        requestedDomains: Array.from({ length: 49 }, (_, i) => ({
          domain: `service-${i}.example.com`,
          requestedAtMs: 1,
        })),
      },
    });

    const result = await requestOwnerPolicyDomains(mockAuth, {
      ownerId: "owner-sid",
      domains: ["one.example.com", "two.example.com"],
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("rejects the batch when any domain is malformed", async () => {
    setGcsObjects({ [OWNER_PATH]: { allowedDomains: [] } });

    const result = await requestOwnerPolicyDomains(mockAuth, {
      ownerId: "owner-sid",
      domains: ["api.stripe.com", "api.*.com"],
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });
});
