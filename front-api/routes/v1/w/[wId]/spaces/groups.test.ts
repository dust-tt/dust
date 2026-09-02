import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSpaceGroupIds(
  workspace: { sId: string },
  key: { secret: string },
  spaceIds?: string[]
) {
  const query = spaceIds ? `?spaceIds=${spaceIds.join(",")}` : "";

  return honoApp.request(`/api/v1/w/${workspace.sId}/spaces/groups${query}`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

async function setupTest({ systemKey = true }: { systemKey?: boolean } = {}) {
  const { workspace, key, globalGroup, systemGroup } =
    await createPublicApiMockRequest({ systemKey });

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const { globalSpace } = await SpaceResource.makeDefaultsForWorkspace(auth, {
    globalGroup,
    systemGroup,
  });

  const space = await SpaceFactory.regular(workspace);
  const memberGroup = await space.fetchManualMemberGroup(auth);

  return { workspace, key, globalGroup, globalSpace, space, memberGroup };
}

describe("GET /api/v1/w/:wId/spaces/groups", () => {
  it("returns 403 if not a system key", async () => {
    const { workspace, key, space } = await setupTest({ systemKey: false });

    const response = await getSpaceGroupIds(workspace, key, [space.sId]);

    expect(response.status).toBe(403);
  });

  it("returns the group that stands for each requested space", async () => {
    const { workspace, key, globalGroup, globalSpace, space, memberGroup } =
      await setupTest();

    const response = await getSpaceGroupIds(workspace, key, [
      globalSpace.sId,
      space.sId,
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groupIds: [globalGroup.sId, memberGroup.sId],
    });
  });

  it("skips a space of another workspace", async () => {
    const { workspace, key, space, memberGroup } = await setupTest();
    const otherWorkspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(otherWorkspace);
    const otherSpace = await SpaceFactory.regular(otherWorkspace);

    const response = await getSpaceGroupIds(workspace, key, [
      space.sId,
      otherSpace.sId,
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ groupIds: [memberGroup.sId] });
  });

  it("returns 400 without space ids", async () => {
    const { workspace, key } = await setupTest();

    const response = await getSpaceGroupIds(workspace, key);

    expect(response.status).toBe(400);
  });
});
