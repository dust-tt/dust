import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function postMembers(
  workspace: { sId: string },
  spaceId: string,
  keySecret: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/members`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${keySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/:wId/spaces/:spaceId/members", () => {
  it("adds a member to a restricted regular space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await postMembers(workspace, space.sId, key.secret, {
      userIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const { users } = await response.json();
    expect(users).toEqual(
      expect.arrayContaining([expect.objectContaining({ sId: user.sId })])
    );
  });

  it("adds a member to an open regular space", async () => {
    // An open space (the workspace global group holds a reader grant) is still member-editable: the
    // explicit member group confers write beyond the workspace-wide read.
    const { workspace, globalGroup, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space, globalGroup);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await postMembers(workspace, space.sId, key.secret, {
      userIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const { users } = await response.json();
    expect(users).toEqual(
      expect.arrayContaining([expect.objectContaining({ sId: user.sId })])
    );
  });

  it("rejects a global space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const globalSpace = await SpaceFactory.global(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await postMembers(workspace, globalSpace.sId, key.secret, {
      userIds: [user.sId],
    });

    expect(response.status).toBe(404);
  });
});
