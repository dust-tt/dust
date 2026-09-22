import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/poke/workspaces/:wId/auth-context", () => {
  it("includes the workspace's skill reader grant alongside admin capabilities", async () => {
    const workspace = await WorkspaceFactory.basic();
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/auth-context`
    );

    expect(response.status).toBe(200);
    const { workspacePermissions } = await response.json();
    expect(workspacePermissions.skill).toEqual([
      "read",
      "create",
      "publish",
      "make_discoverable",
    ]);
  });
});
