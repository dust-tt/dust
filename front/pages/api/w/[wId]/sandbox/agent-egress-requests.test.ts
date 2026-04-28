import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

import handler from "./agent-egress-requests";

describe("GET/PUT /api/w/[wId]/sandbox/agent-egress-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current setting to workspace admins with sandbox tools enabled", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      allowAgentEgressRequests: false,
    });
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });

  it("updates the setting and emits an audit event", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    req.body = {
      enabled: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      allowAgentEgressRequests: true,
    });

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.sandboxAllowAgentEgressRequests).toBe(true);

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_egress_policy.agent_requests_setting_updated",
        auth: expect.any(Object),
        context: expect.objectContaining({
          location: expect.any(String),
        }),
        metadata: {
          enabled: "true",
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

  it("rejects invalid request bodies", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    req.body = {
      enabled: "true",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
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

  it("rejects non-admin users on GET", async () => {
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

  it("rejects non-admin users on PUT and does not persist or audit", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    req.body = {
      enabled: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        type: "workspace_auth_error",
      },
    });

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.sandboxAllowAgentEgressRequests).toBe(false);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
  });
});
