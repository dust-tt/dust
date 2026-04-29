import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchByConversationId,
  mockReadSandboxPolicy,
  mockReadWorkspacePolicy,
} = vi.hoisted(() => ({
  mockFetchByConversationId: vi.fn(),
  mockReadSandboxPolicy: vi.fn(),
  mockReadWorkspacePolicy: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/egress_policy", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/sandbox/egress_policy")
  >("@app/lib/api/sandbox/egress_policy");

  return {
    ...actual,
    readSandboxPolicy: mockReadSandboxPolicy,
    readWorkspacePolicy: mockReadWorkspacePolicy,
  };
});

vi.mock("@app/lib/resources/sandbox_resource", () => ({
  SandboxResource: {
    fetchByConversationId: mockFetchByConversationId,
  },
}));

import { lookupAutoApprovePredicate } from "@app/lib/actions/auto_approve_registry";

describe("lookupAutoApprovePredicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadWorkspacePolicy.mockResolvedValue(new Ok({ allowedDomains: [] }));
    mockReadSandboxPolicy.mockResolvedValue(new Ok({ allowedDomains: [] }));
    mockFetchByConversationId.mockResolvedValue(null);
  });

  it("auto-approves add_egress_domain when the workspace policy covers the domain", async () => {
    const { authenticator: auth } = await createResourceTest({});
    mockReadWorkspacePolicy.mockResolvedValue(
      new Ok({ allowedDomains: ["*.github.com"] }),
    );

    const predicate = lookupAutoApprovePredicate(
      "sandbox",
      "add_egress_domain",
    );
    if (!predicate) {
      throw new Error("Expected sandbox add_egress_domain predicate");
    }

    const result = await predicate({
      auth,
      conversationId: "conversation",
      rawInputs: {
        domain: "api.github.com",
        reason: "Fetch release metadata.",
      },
    });

    expect(result).toBe(true);
    expect(mockFetchByConversationId).not.toHaveBeenCalled();
    expect(mockReadSandboxPolicy).not.toHaveBeenCalled();
  });

  it("auto-approves add_egress_domain when the active sandbox policy covers the domain", async () => {
    const { authenticator: auth } = await createResourceTest({});
    mockFetchByConversationId.mockResolvedValue({
      providerId: "provider-id",
    });
    mockReadSandboxPolicy.mockResolvedValue(
      new Ok({ allowedDomains: ["api.github.com"] }),
    );

    const predicate = lookupAutoApprovePredicate(
      "sandbox",
      "add_egress_domain",
    );
    if (!predicate) {
      throw new Error("Expected sandbox add_egress_domain predicate");
    }

    const result = await predicate({
      auth,
      conversationId: "conversation",
      rawInputs: {
        domain: "api.github.com",
        reason: "Fetch release metadata.",
      },
    });

    expect(result).toBe(true);
    expect(mockFetchByConversationId).toHaveBeenCalledWith(
      auth,
      "conversation",
    );
    expect(mockReadSandboxPolicy).toHaveBeenCalledWith("provider-id");
  });

  it("does not auto-approve malformed inputs", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const predicate = lookupAutoApprovePredicate(
      "sandbox",
      "add_egress_domain",
    );
    if (!predicate) {
      throw new Error("Expected sandbox add_egress_domain predicate");
    }

    const result = await predicate({
      auth,
      conversationId: "conversation",
      rawInputs: {
        domain: "*.github.com",
        reason: "Wildcard requests are rejected.",
      },
    });

    expect(result).toBe(false);
    expect(mockFetchByConversationId).not.toHaveBeenCalled();
    expect(mockReadSandboxPolicy).not.toHaveBeenCalled();
  });
});
