import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
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

function listEnvVars(wId: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars`);
}

function postEnvVar(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET/POST /api/w/:wId/sandbox/env-vars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await listEnvVars(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 403 when sandbox feature flags are missing", async () => {
    const { workspace } = await setupTest({ withFeatureFlags: false });

    const response = await listEnvVars(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
  });

  it("returns an empty list when no env vars exist", async () => {
    const { workspace } = await setupTest();

    const response = await listEnvVars(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ envVars: [] });
  });

  it("creates a config env var with the DST_ prefix and returns 201", async () => {
    const { workspace, auth } = await setupTest();

    const response = await postEnvVar(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "super-secret-token",
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      envVar: { name: string; kind: string };
      created: boolean;
    };
    expect(data.created).toBe(true);
    expect(data.envVar.name).toBe("DST_API_TOKEN");
    expect(data.envVar.kind).toBe("config");

    const envResult = await WorkspaceSandboxEnvVarResource.loadEnv(auth);
    expect(envResult.isOk()).toBe(true);
  });

  it("returns 200 when overwriting an existing env var", async () => {
    const { workspace, auth } = await setupTest();

    await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "initial-value",
    });

    const response = await postEnvVar(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "rotated-value",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { created: boolean };
    expect(data.created).toBe(false);
  });

  it("rejects invalid POST body via zod", async () => {
    const { workspace } = await setupTest();

    const response = await postEnvVar(workspace.sId, { name: "MY_VAR" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });
});
