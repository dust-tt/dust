import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getScopableGroups(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/keys/groups`);
}

describe("GET /api/w/:wId/keys/groups", () => {
  it("returns the groups the caller is a member of, and only those", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const mine = await GroupFactory.regularManual(workspace, "Mine");
    await GroupFactory.withMembers(auth, mine, [user]);

    // A group the caller does not belong to must not be listed.
    await GroupFactory.regularManual(workspace, "Theirs");

    const response = await getScopableGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    const names = groups.map((g: { name: string }) => g.name);
    expect(names).toContain("Mine");
    expect(names).not.toContain("Theirs");
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
