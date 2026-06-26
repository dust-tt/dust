import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

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
  }

  return { workspace, auth, ...rest };
}

function patchEnvVar(wId: string, id: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteEnvVar(wId: string, id: string) {
  return honoApp.request(`/api/w/${wId}/sandbox/env-vars/${id}`, {
    method: "DELETE",
  });
}

describe("PATCH/DELETE /api/w/:wId/sandbox/env-vars/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin requests", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await deleteEnvVar(workspace.sId, "env_var_unknown");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
  });

  it("returns 404 for a missing sandbox environment variable", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    if (upsert.isErr()) {
      throw upsert.error;
    }
    const staleSId = upsert.value.resource.sId;
    await upsert.value.resource.delete(auth);

    const response = await deleteEnvVar(workspace.sId, staleSId);

    expect(response.status).toBe(404);
  });

  it("deletes an existing sandbox environment variable", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await deleteEnvVar(
      workspace.sId,
      upsert.value.resource.sId
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(
      await WorkspaceSandboxEnvVarResource.fetchByName(auth, "API_TOKEN")
    ).toBeNull();
  });

  it("rejects an empty PATCH body", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await patchEnvVar(
      workspace.sId,
      upsert.value.resource.sId,
      {}
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("updates allowed domains on an HTTPS secret", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
      kind: "https_secret",
      allowedDomains: ["api.example.com"],
    });
    if (upsert.isErr()) {
      throw upsert.error;
    }

    const response = await patchEnvVar(
      workspace.sId,
      upsert.value.resource.sId,
      { allowedDomains: ["api.example.com", "api.github.com"] }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      envVar: { allowedDomains: string[] };
    };
    expect(data.envVar.allowedDomains).toEqual([
      "api.example.com",
      "api.github.com",
    ]);
  });
});
