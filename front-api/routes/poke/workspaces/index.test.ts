import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function createNamedWorkspace(name: string) {
  const workspace = await WorkspaceFactory.basic();
  const resource = await WorkspaceResource.fetchById(workspace.sId);
  if (!resource) {
    throw new Error("Workspace not found after creation");
  }
  await WorkspaceResource.updateName(resource.id, name);
  return workspace;
}

function searchWorkspaces(search: string, limit: string) {
  const params = new URLSearchParams({
    search: encodeURIComponent(search),
    limit,
  });
  return honoApp.request(`/api/poke/workspaces?${params.toString()}`);
}

describe("GET /api/poke/workspaces — workspace name search", () => {
  it("matches by prefix", async () => {
    const workspace = await createNamedWorkspace("Zorbix Industries");
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await searchWorkspaces("Zorbix", "20");

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches by a word in the middle of the name", async () => {
    const workspace = await createNamedWorkspace("Zorbix Industries");
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await searchWorkspaces("Industries", "20");

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const workspace = await createNamedWorkspace("Zorbix Industries");
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await searchWorkspaces("industries", "20");

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });
});
