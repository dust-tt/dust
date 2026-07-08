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
  return honoApp.request(`/api/w/${workspace.sId}/skills/github-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills/github-connection", () => {
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
    for (const role of ["builder", "user"] as const) {
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
