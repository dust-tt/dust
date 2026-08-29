import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getScopableGroups(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/keys/groups`);
}

// The regular_auto member group name of a space, resolved from its grants.
async function spaceMemberGroupName(
  auth: Authenticator,
  space: SpaceResource
): Promise<string> {
  const referencesBySpaceModelId =
    await SpaceResource.listGrantReferencesBySpaceModelId([space]);
  const groupModelIds = [...referencesBySpaceModelId.values()]
    .flat()
    .map((reference) => reference.groupId);
  const groups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    groupModelIds
  );
  const memberGroup = groups.find((group) => group.kind === "regular_auto");
  if (!memberGroup) {
    throw new Error("Expected a regular_auto member group for the space.");
  }
  return memberGroup.name;
}

describe("GET /api/w/:wId/keys/groups", () => {
  it("lists the groups of restricted spaces (regular and pods), and only those", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Regular restricted space: its member group is scopable.
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const restrictedGroupName = await spaceMemberGroupName(
      auth,
      restrictedSpace
    );

    // Regular open space (global group attached): not restricted, so its group
    // is excluded.
    const openSpace = await SpaceFactory.regular(workspace);
    const openGroupName = await spaceMemberGroupName(auth, openSpace);
    await SpaceFactory.attachGroup(openSpace, globalGroup, "project_viewer");

    // A group not associated to any space is excluded.
    await GroupFactory.regularManual(workspace, "Unassociated");

    const response = await getScopableGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    const names = groups.map((g: { name: string }) => g.name);
    expect(names).toContain(restrictedGroupName);
    expect(names).not.toContain(openGroupName);
    expect(names).not.toContain("Unassociated");
  });

  it("includes restricted pod (project) groups", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Restricted pod: its member/editor groups are scopable.
    const restrictedPod = await SpaceFactory.project(workspace, undefined, {
      name: "SecretPod",
    });
    const restrictedPodGroupName = await spaceMemberGroupName(
      auth,
      restrictedPod
    );

    const response = await getScopableGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    const names = groups.map((g: { name: string }) => g.name);
    expect(names).toContain(restrictedPodGroupName);
  });

  it("excludes open pod (project) groups", async () => {
    const { workspace, auth, globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Open pod (global group attached as viewer): not restricted, so its
    // groups are excluded.
    const openPod = await SpaceFactory.project(workspace, undefined, {
      name: "OpenPod",
    });
    const openPodGroupName = await spaceMemberGroupName(auth, openPod);
    await SpaceFactory.attachGroup(openPod, globalGroup, "project_viewer");

    const response = await getScopableGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    const names = groups.map((g: { name: string }) => g.name);
    expect(names).not.toContain(openPodGroupName);
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await getScopableGroups(workspace);

    expect(response.status).toBe(403);
  });
});
