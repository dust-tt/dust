import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

import handler from "./index";

async function createNamedWorkspace(name: string) {
  const workspace = await WorkspaceFactory.basic();
  const resource = await WorkspaceResource.fetchById(workspace.sId);
  if (!resource) {
    throw new Error("Workspace not found after creation");
  }
  await WorkspaceResource.updateName(resource.id, name);
  return workspace;
}

describe("GET /api/poke/workspaces — workspace name search", () => {
  it("matches by prefix", async () => {
    const workspace = await createNamedWorkspace("Bouygues Construction");
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      workspace,
    });
    req.query.search = encodeURIComponent("Bouygues");
    req.query.limit = "20";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { workspaces } = res._getJSONData();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches by a word in the middle of the name", async () => {
    const workspace = await createNamedWorkspace("Bouygues Construction");
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      workspace,
    });
    req.query.search = encodeURIComponent("Construction");
    req.query.limit = "20";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { workspaces } = res._getJSONData();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const workspace = await createNamedWorkspace("Bouygues Construction");
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      workspace,
    });
    req.query.search = encodeURIComponent("construction");
    req.query.limit = "20";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { workspaces } = res._getJSONData();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });
});
