import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
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
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await searchWorkspaces("Zorbix", "20");

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches by a word in the middle of the name", async () => {
    const workspace = await createNamedWorkspace("Zorbix Industries");
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await searchWorkspaces("Industries", "20");

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const workspace = await createNamedWorkspace("Zorbix Industries");
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

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
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

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
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

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
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

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
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

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

  it("returns a workspace with no active subscription when filtering by planType=free", async () => {
    const workspace = await createNamedWorkspace("Quibble No Sub Corp", () =>
      WorkspaceFactory.basic()
    );
    await SubscriptionResource.endActiveSubscription(workspace);
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble No Sub Corp"),
      limit: "20",
      planType: "free",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(true);
  });

  it("excludes a workspace with no active subscription when filtering by planType=legacy_pro", async () => {
    const workspace = await createNamedWorkspace(
      "Quibble No Sub Corp Two",
      () => WorkspaceFactory.basic()
    );
    await SubscriptionResource.endActiveSubscription(workspace);
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Quibble No Sub Corp Two"),
      limit: "20",
      planType: "legacy_pro",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(false);
  });

  it("rejects an unknown planType value", async () => {
    await createPokeApiMockRequest({ isSuperUser: true });

    const response = await fetchWorkspaces({ planType: "not_a_real_bucket" });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/poke/workspaces — planCode filter", () => {
  it("returns only the workspaces whose active subscription is on that plan code", async () => {
    const onPlan = await createNamedWorkspace("Wibble Plan Code On", () =>
      WorkspaceFactory.basic()
    );
    const onOtherPlan = await createNamedWorkspace("Wibble Plan Code Off", () =>
      WorkspaceFactory.byok()
    );
    await createPokeApiMockRequest({ isSuperUser: true, workspace: onPlan });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Code"),
      limit: "20",
      planCode: PRO_PLAN_SEAT_29_CODE,
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    const sIds = workspaces.map((w: { sId: string }) => w.sId);
    expect(sIds).toContain(onPlan.sId);
    expect(sIds).not.toContain(onOtherPlan.sId);
  });

  it("excludes a workspace whose subscription to that plan has ended", async () => {
    const workspace = await createNamedWorkspace("Wibble Plan Code Ended", () =>
      WorkspaceFactory.basic()
    );
    await SubscriptionResource.endActiveSubscription(workspace);
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Code Ended"),
      limit: "20",
      planCode: PRO_PLAN_SEAT_29_CODE,
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(
      workspaces.some((w: { sId: string }) => w.sId === workspace.sId)
    ).toBe(false);
  });

  it("returns no workspace for an unknown plan code", async () => {
    await createNamedWorkspace("Wibble Plan Code Unknown");
    await createPokeApiMockRequest({ isSuperUser: true });

    const response = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Code Unknown"),
      limit: "20",
      planCode: "NOT_A_REAL_PLAN_CODE",
    });

    expect(response.status).toBe(200);
    const { workspaces } = await response.json();
    expect(workspaces).toEqual([]);
  });

  it("intersects planCode with a planType bucket", async () => {
    const workspace = await createNamedWorkspace(
      "Wibble Plan Code Bucket",
      () => WorkspaceFactory.basic()
    );
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const matchingBucket = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Code Bucket"),
      limit: "20",
      planCode: PRO_PLAN_SEAT_29_CODE,
      planType: "legacy_pro",
    });
    expect(matchingBucket.status).toBe(200);
    expect(
      (await matchingBucket.json()).workspaces.map(
        (w: { sId: string }) => w.sId
      )
    ).toContain(workspace.sId);

    const conflictingBucket = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Code Bucket"),
      limit: "20",
      planCode: PRO_PLAN_SEAT_29_CODE,
      planType: "enterprise",
    });
    expect(conflictingBucket.status).toBe(200);
    expect((await conflictingBucket.json()).workspaces).toEqual([]);
  });

  it("pages through the workspaces on a plan", async () => {
    // Created in order, so they sort newest-first (createdAt DESC).
    const first = await createNamedWorkspace("Wibble Plan Page One", () =>
      WorkspaceFactory.basic()
    );
    const second = await createNamedWorkspace("Wibble Plan Page Two", () =>
      WorkspaceFactory.basic()
    );
    await createPokeApiMockRequest({ isSuperUser: true, workspace: first });

    const firstPage = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Page"),
      limit: "1",
      offset: "0",
      planCode: PRO_PLAN_SEAT_29_CODE,
    });
    expect(firstPage.status).toBe(200);
    const firstPageBody = await firstPage.json();
    expect(firstPageBody.workspaces.map((w: { sId: string }) => w.sId)).toEqual(
      [second.sId]
    );
    expect(firstPageBody.hasMore).toBe(true);

    const secondPage = await fetchWorkspaces({
      search: encodeURIComponent("Wibble Plan Page"),
      limit: "1",
      offset: "1",
      planCode: PRO_PLAN_SEAT_29_CODE,
    });
    expect(secondPage.status).toBe(200);
    const secondPageBody = await secondPage.json();
    expect(
      secondPageBody.workspaces.map((w: { sId: string }) => w.sId)
    ).toEqual([first.sId]);
    expect(secondPageBody.hasMore).toBe(false);
  });
});

describe("GET /api/poke/workspaces — pagination", () => {
  it("pages through results via offset, and reports hasMore correctly", async () => {
    // Created in order, so they sort newest-first (createdAt DESC) as
    // Gamma, Beta, Alpha.
    const alpha = await createNamedWorkspace("Nimbus Page Test Alpha");
    const beta = await createNamedWorkspace("Nimbus Page Test Beta");
    const gamma = await createNamedWorkspace("Nimbus Page Test Gamma");
    await createPokeApiMockRequest({ isSuperUser: true, workspace: alpha });

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
    await createPokeApiMockRequest({ isSuperUser: true });

    const response = await fetchWorkspaces({ offset: "not_a_number" });

    expect(response.status).toBe(400);
  });
});
