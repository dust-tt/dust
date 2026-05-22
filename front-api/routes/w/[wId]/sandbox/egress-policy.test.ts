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
} = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
  mockReadWorkspacePolicy: vi.fn(),
  mockWriteWorkspacePolicy: vi.fn(),
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
}));

async function setupTest({
  role = "admin",
  withFeatureFlags = true,
}: {
  role?: MembershipRoleType;
  withFeatureFlags?: boolean;
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

  if (withFeatureFlags) {
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    await FeatureFlagFactory.basic(auth, "sandbox_workspace_admin");
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
  });

  it("returns the workspace egress policy to workspace admins with sandbox tools enabled", async () => {
    const { workspace } = await setupTest();

    const response = await getPolicy(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
    });
    expect(mockReadWorkspacePolicy).toHaveBeenCalledWith(expect.any(Object));
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

  it("rejects workspaces without sandbox tools enabled", async () => {
    const { workspace } = await setupTest({ withFeatureFlags: false });

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
