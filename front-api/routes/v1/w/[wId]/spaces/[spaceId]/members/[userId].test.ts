import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function deleteMember(
  workspace: { sId: string },
  spaceId: string,
  userId: string,
  keySecret: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/members/${userId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${keySecret}` },
    }
  );
}

async function addMember(
  workspace: { sId: string },
  space: SpaceResource,
  user: UserResource
) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const res = await space.addMembers(adminAuth, { userIds: [user.sId] });
  expect(res.isOk()).toBe(true);
}

describe("DELETE /api/v1/w/:wId/spaces/:spaceId/members/:userId", () => {
  it("removes a member from a regular space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await addMember(workspace, space, user);

    const response = await deleteMember(
      workspace,
      space.sId,
      user.sId,
      key.secret
    );

    expect(response.status).toBe(200);
  });

  it("removes a member from a project space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const project = await SpaceFactory.project(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await addMember(workspace, project, user);

    const response = await deleteMember(
      workspace,
      project.sId,
      user.sId,
      key.secret
    );

    expect(response.status).toBe(200);
  });

  it("rejects removing a user who is not a member", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const space = await SpaceFactory.regular(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await deleteMember(
      workspace,
      space.sId,
      user.sId,
      key.secret
    );

    expect(response.status).toBe(400);
  });

  it("rejects a global space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const globalSpace = await SpaceFactory.global(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await deleteMember(
      workspace,
      globalSpace.sId,
      user.sId,
      key.secret
    );

    expect(response.status).toBe(404);
  });
});
