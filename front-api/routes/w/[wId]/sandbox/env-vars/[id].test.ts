import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
}: {
  role?: MembershipRoleType;
} = {}) {
  const { workspace, auth, ...rest } = await createPrivateApiMockRequest({
    role,
  });

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

  it("returns 404 for a pod-scoped row and leaves it untouched", async () => {
    const { workspace, auth, user } = await setupTest();
    const pod = await SpaceFactory.project(workspace, user.id);

    // Pod rows live in the same table — the workspace surface must neither
    // read nor mutate them.
    const createResult = await SandboxEnvVarResource.makeNew(
      auth,
      { kind: "pod", pod },
      { name: "POD_TOKEN", value: "pod-value" }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const sandboxEnvVarId = createResult.value.sId;

    const patchResponse = await patchEnvVar(workspace.sId, sandboxEnvVarId, {
      allowedDomains: ["api.example.com"],
    });
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await deleteEnvVar(workspace.sId, sandboxEnvVarId);
    expect(deleteResponse.status).toBe(404);

    const survivor = await SandboxEnvVarResource.fetchById(
      auth,
      sandboxEnvVarId
    );
    expect(survivor).not.toBeNull();
  });

  it("returns 404 for a missing sandbox environment variable", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
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

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
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
      await SandboxEnvVarResource.fetchByName(
        auth,
        { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
        "API_TOKEN"
      )
    ).toBeNull();
  });

  it("rejects an empty PATCH body", async () => {
    const { workspace, auth } = await setupTest();

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
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

    const upsert = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      {
        name: "API_TOKEN",
        value: "super-secret-token",
        kind: "https_secret",
        allowedDomains: ["api.example.com"],
      }
    );
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
