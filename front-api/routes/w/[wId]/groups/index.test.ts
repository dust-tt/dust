import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGroupsRequest(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(`/api/w/${wId}/groups${qs ? `?${qs}` : ""}`);
}

describe("GET /api/w/:wId/groups", () => {
  it("returns memberCount but no memberIds by default", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toEqual([
      expect.objectContaining({
        sId: sales.sId,
        name: "Sales",
        memberCount: 1,
      }),
    ]);
    expect(body.groups[0].memberIds).toBeUndefined();
  });

  it("omits poolCapAwuCredits unless withPoolCaps=true is requested", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    const capRes = await sales.updatePoolCap(1234);
    if (capRes.isErr()) {
      throw capRes.error;
    }

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].poolCapAwuCredits).toBeUndefined();
  });

  it("returns poolCapAwuCredits when withPoolCaps=true is requested", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const capped = await GroupFactory.regularManual(workspace, "Capped");
    const capRes = await capped.updatePoolCap(1234);
    if (capRes.isErr()) {
      throw capRes.error;
    }
    await GroupFactory.regularManual(workspace, "Uncapped");

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
      withPoolCaps: "true",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // A group without a row reports null, distinct from the field being absent.
    // The endpoint does not order its results, so match by name.
    expect(body.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Capped", poolCapAwuCredits: 1234 }),
        expect.objectContaining({ name: "Uncapped", poolCapAwuCredits: null }),
      ])
    );
    expect(body.groups).toHaveLength(2);
  });

  it("returns poolCapAwuCredits alongside memberIds when both flags are set", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);
    const capRes = await sales.updatePoolCap(4321);
    if (capRes.isErr()) {
      throw capRes.error;
    }

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
      withMembers: "true",
      withPoolCaps: "true",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toEqual([
      expect.objectContaining({
        sId: sales.sId,
        memberIds: [alice.sId],
        poolCapAwuCredits: 4321,
      }),
    ]);
  });

  it("returns memberIds when withMembers=true is requested", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
      withMembers: "true",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toEqual([
      expect.objectContaining({
        sId: sales.sId,
        name: "Sales",
        memberCount: 1,
        memberIds: [alice.sId],
      }),
    ]);
  });
});
