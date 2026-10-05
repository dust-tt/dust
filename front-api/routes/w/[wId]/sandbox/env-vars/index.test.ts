import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
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
}: {
  role?: MembershipRoleType;
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

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

  it("lets a member with the admin:security permission list env vars", async () => {
    const { workspace, user } = await setupTest({ role: "user" });
    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await listEnvVars(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ envVars: [] });
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await listEnvVars(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You are not authorized to manage the sandbox.",
      },
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

    const envResult = await SandboxEnvVarResource.loadEnv(auth, {
      kind: "workspace",
      workspace: auth.getNonNullableWorkspace(),
    });
    expect(envResult.isOk()).toBe(true);
  });

  it("returns 200 when overwriting an existing env var", async () => {
    const { workspace, auth } = await setupTest();

    await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "initial-value",
      }
    );

    const response = await postEnvVar(workspace.sId, {
      name: "DST_API_TOKEN",
      value: "rotated-value",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { created: boolean };
    expect(data.created).toBe(false);
  });

  it("rejects an HTTPS secret whose allowed domain has a single label", async () => {
    const { workspace, auth } = await setupTest();

    const response = await postEnvVar(workspace.sId, {
      name: "DSEC_API_TOKEN",
      value: "super-secret-token",
      kind: "https_secret",
      allowedDomains: ["localhost"],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: expect.stringContaining("at least two DNS labels"),
      },
    });
    expect(
      await SandboxEnvVarResource.fetchByName(
        auth,
        { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
        "API_TOKEN"
      )
    ).toBeNull();
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
