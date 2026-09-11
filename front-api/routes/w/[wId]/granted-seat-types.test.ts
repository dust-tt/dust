import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function enableFlag(auth: Authenticator) {
  await FeatureFlagFactory.basic(auth, "group_seat_provisioning");
}

async function makeSeatGroup(
  workspace: WorkspaceType,
  name: string,
  grantedSeatType: "workspace" | "pro" | "max"
): Promise<GroupResource> {
  return GroupResource.makeNew({
    name,
    workspaceId: workspace.id,
    kind: "provisioned",
    workOSGroupId: `workos-${name}`,
    grantedSeatType,
  });
}

function getGrantedSeatTypes(wId: string) {
  return honoApp.request(`/api/w/${wId}/granted-seat-types`, { method: "GET" });
}

describe("/api/w/[wId]/granted-seat-types", () => {
  it("returns the distinct granted seat types when the flag is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const { auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });
    await enableFlag(auth);
    await makeSeatGroup(workspace, "g-pro", "pro");
    await makeSeatGroup(workspace, "g-pro-2", "pro"); // duplicate tier
    await makeSeatGroup(workspace, "g-max", "max");

    const response = await getGrantedSeatTypes(workspace.sId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect([...body.grantedSeatTypes].sort()).toEqual(["max", "pro"]);
  });

  it("returns an empty list when the flag is disabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });
    // Flag not enabled — even with a seat-granting group, nothing is reported.
    await makeSeatGroup(workspace, "g-pro", "pro");

    const response = await getGrantedSeatTypes(workspace.sId);
    expect(response.status).toBe(200);
    expect((await response.json()).grantedSeatTypes).toEqual([]);
  });

  it("does not include other workspaces' seat-granting groups", async () => {
    const workspace = await WorkspaceFactory.basic();
    const otherWorkspace = await WorkspaceFactory.basic();
    const { auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });
    await enableFlag(auth);
    await makeSeatGroup(otherWorkspace, "g-other", "max");

    const response = await getGrantedSeatTypes(workspace.sId);
    expect(response.status).toBe(200);
    expect((await response.json()).grantedSeatTypes).toEqual([]);
  });
});
