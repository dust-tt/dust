import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequestOwnerPolicyDomains, mockRequestWorkspacePolicyDomains } =
  vi.hoisted(() => ({
    mockRequestOwnerPolicyDomains: vi.fn(),
    mockRequestWorkspacePolicyDomains: vi.fn(),
  }));

vi.mock("@app/lib/api/sandbox/egress_policy", () => ({
  requestOwnerPolicyDomains: mockRequestOwnerPolicyDomains,
  requestWorkspacePolicyDomains: mockRequestWorkspacePolicyDomains,
}));

import {
  formatEgressDomainRequestsNote,
  requestEgressDomainsForScope,
} from "./egress_domain_requests";

const mockAuth = {} as unknown as Authenticator;
const EMPTY_POLICY = { allowedDomains: [] };

describe("requestEgressDomainsForScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("files on the Pod and splits outcomes into requested and already allowed", async () => {
    mockRequestOwnerPolicyDomains.mockResolvedValue(
      new Ok({
        policy: EMPTY_POLICY,
        outcomes: [
          { domain: "api.stripe.com", outcome: "already_allowed" },
          { domain: "*.stripe.com", outcome: "requested" },
          { domain: "hooks.slack.com", outcome: "already_requested" },
        ],
      })
    );

    const summary = await requestEgressDomainsForScope(mockAuth, {
      scope: { kind: "pod", podId: "vlt_pod" },
      domains: ["api.stripe.com", "*.stripe.com", "hooks.slack.com"],
    });

    expect(mockRequestOwnerPolicyDomains).toHaveBeenCalledWith(mockAuth, {
      ownerId: "vlt_pod",
      domains: ["api.stripe.com", "*.stripe.com", "hooks.slack.com"],
    });
    expect(mockRequestWorkspacePolicyDomains).not.toHaveBeenCalled();
    expect(summary).toEqual({
      kind: "filed",
      scope: "pod",
      requested: ["*.stripe.com", "hooks.slack.com"],
      alreadyAllowed: ["api.stripe.com"],
    });
  });

  it("files on the workspace when there is no Pod", async () => {
    mockRequestWorkspacePolicyDomains.mockResolvedValue(
      new Ok({
        policy: EMPTY_POLICY,
        outcomes: [{ domain: "api.stripe.com", outcome: "requested" }],
      })
    );

    const summary = await requestEgressDomainsForScope(mockAuth, {
      scope: { kind: "workspace" },
      domains: ["api.stripe.com"],
    });

    expect(mockRequestOwnerPolicyDomains).not.toHaveBeenCalled();
    expect(summary).toEqual({
      kind: "filed",
      scope: "workspace",
      requested: ["api.stripe.com"],
      alreadyAllowed: [],
    });
  });

  it("reports every domain as failed with the reason when the batch is rejected", async () => {
    mockRequestWorkspacePolicyDomains.mockResolvedValue(
      new Err(new Error("cap reached"))
    );

    const summary = await requestEgressDomainsForScope(mockAuth, {
      scope: { kind: "workspace" },
      domains: ["api.stripe.com", "*.stripe.com"],
    });

    expect(summary).toEqual({
      kind: "failed",
      domains: ["api.stripe.com", "*.stripe.com"],
      message: "cap reached",
    });
  });
});

describe("formatEgressDomainRequestsNote", () => {
  it("names the scope and lists pending and already allowed domains", () => {
    expect(
      formatEgressDomainRequestsNote({
        kind: "filed",
        scope: "pod",
        requested: ["*.stripe.com"],
        alreadyAllowed: ["api.stripe.com"],
      })
    ).toBe(
      "Requested for the Pod (pending admin approval): *.stripe.com. Already allowed: api.stripe.com."
    );
  });

  it("returns null when nothing was requested or already allowed", () => {
    expect(
      formatEgressDomainRequestsNote({
        kind: "filed",
        scope: "workspace",
        requested: [],
        alreadyAllowed: [],
      })
    ).toBeNull();
  });

  it("carries the failure reason and the retry hint", () => {
    expect(
      formatEgressDomainRequestsNote({
        kind: "failed",
        domains: ["api.stripe.com"],
        message: "cap reached.",
      })
    ).toBe(
      "Could not request api.stripe.com: cap reached. Retry with request_egress_domain once resolved."
    );
  });
});
