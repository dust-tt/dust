import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function createNamedWorkspace(
  name: string,
  factory: () => Promise<WorkspaceType> = () => WorkspaceFactory.basic()
) {
  const workspace = await factory();
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

function fetchWorkspaces(params: Record<string, string>) {
  return honoApp.request(
    `/api/poke/workspaces?${new URLSearchParams(params).toString()}`
  );
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

describe("GET /api/poke/workspaces — plan type filter", () => {
  it("returns a legacy pro workspace when filtering by planType=legacy_pro", async () => {
    const workspace = await createNamedWorkspace("Quibble Pro Corp", () =>
      WorkspaceFactory.basic()
    );
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble Pro Corp"),
      limit: "20",
      planType: "legacy_pro",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("excludes a legacy pro workspace when filtering by planType=enterprise", async () => {
    const workspace = await createNamedWorkspace("Quibble Pro Corp Two", () =>
      WorkspaceFactory.basic()
    );
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble Pro Corp Two"),
      limit: "20",
      planType: "enterprise",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(false);
  });

  it("returns a legacy enterprise workspace when filtering by planType=legacy_enterprise", async () => {
    const workspace = await createNamedWorkspace(
      "Quibble Enterprise Corp",
      () => WorkspaceFactory.enterprise()
    );
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble Enterprise Corp"),
      limit: "20",
      planType: "legacy_enterprise",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("excludes a legacy enterprise workspace when filtering by planType=enterprise (credit-priced only)", async () => {
    const workspace = await createNamedWorkspace(
      "Quibble Enterprise Corp Two",
      () => WorkspaceFactory.enterprise()
    );
    await createPrivateApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble Enterprise Corp Two"),
      limit: "20",
      planType: "enterprise",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(false);
  });

  it("rejects an unknown planType value", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await fetchWorkspaces({ planType: "not_a_real_bucket" });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/poke/workspaces — pagination", () => {
  it("pages through results via offset, and reports hasMore correctly", async () => {
    // Created in order, so they sort newest-first (createdAt DESC) as
    // Gamma, Beta, Alpha.
    const alpha = await createNamedWorkspace("Nimbus Page Test Alpha");
    const beta = await createNamedWorkspace("Nimbus Page Test Beta");
    const gamma = await createNamedWorkspace("Nimbus Page Test Gamma");
    await createPrivateApiMockRequest({ isSuperUser: true, workspace: alpha });

    const firstPageResponse = await fetchWorkspaces({
      search: encodeURIComponent("Nimbus Page Test"),
      limit: "2",
      offset: "0",
    });
    expect(firstPageResponse.status).toBe(200);
    const firstPage = await firstPageResponse.json();
    expect(firstPage.workspaces.map((w: { sId: string }) => w.sId)).toEqual([
      gamma.sId,
      beta.sId,
    ]);
    expect(firstPage.hasMore).toBe(true);

    const secondPageResponse = await fetchWorkspaces({
      search: encodeURIComponent("Nimbus Page Test"),
      limit: "2",
      offset: "2",
    });
    expect(secondPageResponse.status).toBe(200);
    const secondPage = await secondPageResponse.json();
    expect(secondPage.workspaces.map((w: { sId: string }) => w.sId)).toEqual([
      alpha.sId,
    ]);
    expect(secondPage.hasMore).toBe(false);
  });

  it("rejects a non-numeric offset value", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await fetchWorkspaces({ offset: "not_a_number" });

    expect(response.status).toBe(400);
  });
});
