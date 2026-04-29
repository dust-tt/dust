import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
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

import handler from "./egress-policy";

describe("GET/PUT /api/w/[wId]/sandbox/egress-policy", () => {
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
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      policy: { allowedDomains: ["api.github.com"] },
    });
    expect(mockReadWorkspacePolicy).toHaveBeenCalledWith(expect.any(Object));
  });

  it("updates the workspace egress policy with normalized domains", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    req.body = {
      allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockWriteWorkspacePolicy).toHaveBeenCalledWith(expect.any(Object), {
      policy: {
        allowedDomains: ["api.github.com", "*.github.com"],
      },
    });
    expect(JSON.parse(res._getData())).toEqual({
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
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    req.body = {
      allowedDomains: ["127.0.0.1"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(mockWriteWorkspacePolicy).not.toHaveBeenCalled();
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("rejects workspaces without sandbox tools enabled", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        type: "feature_flag_not_found",
      },
    });
  });

  it("rejects non-admin users", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        type: "workspace_auth_error",
      },
    });
  });

  it("returns 500 when storage read fails", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    mockReadWorkspacePolicy.mockResolvedValue(new Err(new Error("GCS failed")));

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });
});
