import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmitAuditLogEvent,
  mockReadWorkspacePolicy,
  mockWriteWorkspacePolicy,
  mockDismissRequestedWorkspacePolicyDomain,
} = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
  mockReadWorkspacePolicy: vi.fn(),
  mockWriteWorkspacePolicy: vi.fn(),
  mockDismissRequestedWorkspacePolicyDomain: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

vi.mock("@app/lib/api/sandbox/egress_policy", () => ({
  readWorkspacePolicy: mockReadWorkspacePolicy,
  writeWorkspacePolicy: mockWriteWorkspacePolicy,
  dismissRequestedWorkspacePolicyDomain:
    mockDismissRequestedWorkspacePolicyDomain,
}));

async function setupTest({
  role = "admin",
  disableComputerFeature = false,
}: {
  role?: MembershipRoleType;
  disableComputerFeature?: boolean;
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (disableComputerFeature) {
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
  }

  return { workspace, auth, ...rest };
}

function getPolicy(wId: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy`);
}

function putPolicy(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/egress-policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function dismissRequest(wId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${wId}/sandbox/egress-policy/requests/dismiss`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET/PUT /api/w/:wId/sandbox/egress-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockReadWorkspacePolicy.mockResolvedValue(
      new Ok({ allowedDomains: ["api.github.com"] })
    );
    mockWriteWorkspacePolicy.mockImplementation(
      async (
        _auth: unknown,
        { policy }: { policy: { allowedDomains: string[] } }
      ) => {
        return new Ok(policy);
      }
    );
    mockDismissRequestedWorkspacePolicyDomain.mockResolvedValue(
      new Ok({ allowedDomains: ["api.github.com"] })
    );
  });

  it("returns the workspace egress policy to workspace admins with Computer enabled", async () => {
    const { workspace } = await setupTest();

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
      requestedDomains: [],
    });
    expect(mockReadWorkspacePolicy).toHaveBeenCalledWith(expect.any(Object));
  });

  it("surfaces pending requests from the same policy read", async () => {
    const { workspace } = await setupTest();
    mockReadWorkspacePolicy.mockResolvedValue(
      new Ok({
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 42 }],
      })
    );

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: {
        allowedDomains: ["api.github.com"],
        requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 42 }],
      },
      requestedDomains: [{ domain: "api.stripe.com", requestedAtMs: 42 }],
    });
    expect(mockReadWorkspacePolicy).toHaveBeenCalledTimes(1);
  });

  it("dismisses a pending request without granting it", async () => {
    const { workspace } = await setupTest();

    const response = await dismissRequest(workspace.sId, {
      domain: "api.stripe.com",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
    });
    expect(mockDismissRequestedWorkspacePolicyDomain).toHaveBeenCalledWith(
      expect.any(Object),
      { domain: "api.stripe.com" }
    );
    expect(mockWriteWorkspacePolicy).not.toHaveBeenCalled();
  });

  it("rejects a dismiss with a missing domain", async () => {
    const { workspace } = await setupTest();

    const response = await dismissRequest(workspace.sId, {});

    expect(response.status).toBe(400);
    expect(mockDismissRequestedWorkspacePolicyDomain).not.toHaveBeenCalled();
  });

  it("rejects a dismiss from a non-admin user", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await dismissRequest(workspace.sId, {
      domain: "api.stripe.com",
    });

    expect(response.status).toBe(403);
    expect(mockDismissRequestedWorkspacePolicyDomain).not.toHaveBeenCalled();
  });

  it("updates the workspace egress policy with normalized domains", async () => {
    const { workspace } = await setupTest();

    const response = await putPolicy(workspace.sId, {
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    });

    expect(response.status).toBe(200);
    expect(mockWriteWorkspacePolicy).toHaveBeenCalledWith(expect.any(Object), {
      policy: {
        allowedDomains: ["api.github.com", "*.github.com"],
      },
    });
    expect(await response.json()).toEqual({
      policy: {
        allowedDomains: ["api.github.com", "*.github.com"],
      },
    });
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_egress_policy.updated",
        auth: expect.any(Object),
        context: expect.objectContaining({
          location: expect.any(String),
        }),
        metadata: {
          allowed_domain_count: "2",
          allowed_domains: "api.github.com,*.github.com",
        },
        targets: [
          expect.objectContaining({
            type: "workspace",
            id: workspace.sId,
          }),
          {
            type: "sandbox_egress_policy",
            id: workspace.sId,
            name: "Sandbox egress policy",
          },
        ],
      })
    );
  });

  it("rejects invalid domain entries", async () => {
    const { workspace } = await setupTest();

    const response = await putPolicy(workspace.sId, {
      allowedDomains: ["127.0.0.1"],
    });

    expect(response.status).toBe(400);
    expect(mockWriteWorkspacePolicy).not.toHaveBeenCalled();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects workspaces with Computer disabled", async () => {
    const { workspace } = await setupTest({ disableComputerFeature: true });

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
      },
    });
  });

  it("rejects non-admin users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "workspace_auth_error",
      },
    });
  });

  it("returns 500 when storage read fails", async () => {
    const { workspace } = await setupTest();
    mockReadWorkspacePolicy.mockResolvedValue(new Err(new Error("GCS failed")));

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(500);
  });
});
