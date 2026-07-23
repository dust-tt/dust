import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function createGroupWithMember() {
  const { workspace, auth, user } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const group = await GroupFactory.regularManual(
    workspace,
    "Poke member count group"
  );
  const addMemberResult = await GroupFactory.withMembers(auth, group, [user]);
  if (addMemberResult.isErr()) {
    throw addMemberResult.error;
  }

  return { workspace, group };
}

describe("GET /api/poke/workspaces/:wId/groups", () => {
  it("returns actual member counts", async () => {
    const { workspace, group } = await createGroupWithMember();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const responseGroup = data.groups.find(
      (g: { sId: string }) => g.sId === group.sId
    );
    expect(responseGroup?.memberCount).toBe(1);
  });
});

describe("GET /api/poke/workspaces/:wId/groups/:groupId/details", () => {
  it("returns the actual member count", async () => {
    const { workspace, group } = await createGroupWithMember();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups/${group.sId}/details`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.group.memberCount).toBe(1);
  });
});
