import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...actual,
    OAuthAPI: class {
      async getConnectionMetadata() {
        return new Ok({
          connection: {
            connection_id: "con_test",
            created: 0,
            metadata: {},
            provider: "github",
            status: "finalized",
          },
        });
      }
    },
  };
});

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "POST", role });
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/import/github-connection`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function get(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/import/github-connection`
  );
}

function del(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/import/github-connection`,
    {
      method: "DELETE",
    }
  );
}

describe("POST /api/w/:wId/skills/import/github-connection", () => {
  it("stores the connection in workspace metadata for an admin", async () => {
    const { workspace, user } = await setup("admin");

    const response = await post(workspace, {
      connectionId: "test-connection-id",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    await WorkspaceResource.invalidateCache(workspace.sId);
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    expect(refreshed?.metadata?.skillImportGithubConnection).toEqual({
      connectionId: "test-connection-id",
      connectedBy: user.sId,
    });
  });

  it("returns 400 when connectionId is missing", async () => {
    const { workspace } = await setup("admin");

    const response = await post(workspace, {});

    expect(response.status).toBe(400);
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["user", "manager"] as const) {
      const { workspace } = await setup(role);

      const response = await post(workspace, {
        connectionId: "test-connection-id",
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
        },
      });
    }
  });
});

describe("GET /api/w/:wId/skills/import/github-connection", () => {
  it("returns the connection with the connecting user for a connected workspace", async () => {
    const { workspace, user } = await setup("admin");

    await post(workspace, { connectionId: "test-connection-id" });

    const response = await get(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connection).not.toBeNull();
    expect(body.connection.connectedBy).toEqual({
      fullName: user.fullName(),
      imageUrl: user.imageUrl ?? null,
    });
  });

  it("returns a null connection for a workspace with no connection", async () => {
    const { workspace } = await setup("admin");

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connection: null });
  });

  it("returns 403 without the create/skill capability", async () => {
    for (const role of ["user", "manager"] as const) {
      const { workspace } = await setup(role);

      const response = await get(workspace);

      expect(response.status).toBe(403);
    }
  });
});

describe("DELETE /api/w/:wId/skills/import/github-connection", () => {
  it("clears the connection from workspace metadata for an admin", async () => {
    const { workspace } = await setup("admin");

    await post(workspace, { connectionId: "test-connection-id" });

    const response = await del(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    await WorkspaceResource.invalidateCache(workspace.sId);
    const refreshed = await WorkspaceResource.fetchById(workspace.sId);
    expect(refreshed?.metadata?.skillImportGithubConnection).toBeUndefined();
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["user", "manager"] as const) {
      const { workspace } = await setup(role);

      const response = await del(workspace);

      expect(response.status).toBe(403);
    }
  });
});
