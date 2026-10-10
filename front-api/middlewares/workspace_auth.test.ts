import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

function request(path: string) {
  return honoApp.request(`/api${path}`);
}

describe("workspaceAuth factory — default options", () => {
  it("returns 403 on a route under the default catch-all when canUseProduct=false", async () => {
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace, role: "admin" });

    // /groups is mounted under the catch-all `workspaceAuth()` (no override).
    const response = await request(`/w/${workspace.sId}/groups`);

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_can_use_product_required_error",
        message:
          "Your current plan does not allow API access. Please upgrade your plan.",
      },
    });
  });

  it("returns 200 on the default catch-all when canUseProduct=true", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await request(`/w/${workspace.sId}/groups`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("workspaceAuth factory — doesNotRequireCanUseProduct override", () => {
  it("returns 200 for /feature-flags on a canUseProduct=false workspace", async () => {
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace });

    const response = await request(`/w/${workspace.sId}/feature-flags`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feature_flags: [] });
  });

  it("returns 200 for /subscriptions/status on a canUseProduct=false workspace", async () => {
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace });

    const response = await request(`/w/${workspace.sId}/subscriptions/status`);

    expect(response.status).toBe(200);
  });
});

describe("workspaceAuth factory — narrow bypass globs", () => {
  it("returns 403 for /subscriptions/pricing on a canUseProduct=false workspace", async () => {
    // /subscriptions/pricing must fall through to the default catch-all so
    // that the canUseProduct check still applies — the parent override is
    // intentionally scoped to /subscriptions (bare), /checkout-status/*,
    // /status/*, and /checkout/*.
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace, role: "admin" });

    const response = await request(`/w/${workspace.sId}/subscriptions/pricing`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_can_use_product_required_error",
        message:
          "Your current plan does not allow API access. Please upgrade your plan.",
      },
    });
  });

  it("returns 403 for /credits/members-usage on a canUseProduct=false workspace", async () => {
    // /credits/{awu-pool-summary,members-usage,metronome-balances} must fall
    // through to the default catch-all — only the bare GET /credits bypasses.
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace, role: "admin" });

    const response = await request(`/w/${workspace.sId}/credits/members-usage`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_can_use_product_required_error",
        message:
          "Your current plan does not allow API access. Please upgrade your plan.",
      },
    });
  });
});

describe("workspaceAuth factory — idempotency", () => {
  it("a later overlapping middleware does not clobber an earlier override", async () => {
    // /subscriptions/status matches TWO `app.use` lines in the parent: the
    // specific `/subscriptions/status/*` (doesNotRequireCanUseProduct) and the
    // subtree default `/subscriptions/*` (default options). Hono runs both in
    // registration order. Without the idempotency guard, the second would
    // re-run validateWorkspaceAccess with default options and 403 a
    // canUseProduct=false workspace.
    const workspace = await WorkspaceFactory.freeNoProductAccess();
    await createPrivateApiMockRequest({ workspace });

    const response = await request(`/w/${workspace.sId}/subscriptions/status`);

    expect(response.status).toBe(200);
  });
});

describe("workspaceAuth factory — SSO enforcement", () => {
  async function enforceSSO(workspaceId: string) {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    await workspace?.updateWorkspaceSettings({ ssoEnforced: true });
  }

  it("returns 401 sso_enforced for a non-SSO session on an SSO-enforced workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    await enforceSSO(workspace.sId);

    const response = await request(`/w/${workspace.sId}/groups`);

    expect(response.status).toBe(401);
    expect((await response.json()).error.type).toBe("sso_enforced");
  });

  it("returns 401 sso_enforced on auth-context so the SPA can redirect", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    await enforceSSO(workspace.sId);

    const response = await request(`/w/${workspace.sId}/auth-context`);

    expect(response.status).toBe(401);
    expect((await response.json()).error.type).toBe("sso_enforced");
  });

  it("returns 200 for an SSO session on an SSO-enforced workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    await enforceSSO(workspace.sId);

    const { getWorkOSSessionWithSetCookies } =
      await import("@app/lib/api/workos/user");
    const { session } = await getWorkOSSessionWithSetCookies(undefined);
    assert(session, "Expected a mocked session.");
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: { ...session, isSSO: true, authenticationMethod: "SSO" },
      setCookies: [],
    });

    const response = await request(`/w/${workspace.sId}/groups`);

    expect(response.status).toBe(200);
  });
});
