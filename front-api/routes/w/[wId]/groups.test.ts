import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGroups(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/groups${search ? `?${search}` : ""}`
  );
}

describe("GET /api/w/:wId/groups", () => {
  it("returns groups with correct member counts", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regular(workspace, "Engineering");
    await GroupFactory.withMembers(auth, group, [user]);

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const globalGroup = groups.find(
      (g: { kind: string }) => g.kind === "global"
    );
    expect(globalGroup).toBeDefined();
    expect(globalGroup.memberCount).toBe(1);

    const engineeringGroup = groups.find(
      (g: { name: string }) => g.name === "Engineering"
    );
    expect(engineeringGroup).toBeDefined();
    expect(engineeringGroup.memberCount).toBe(1);
  });

  it("reflects multiple members correctly", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regular(workspace, "Design");

    const extraUsers = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
    ]);
    await Promise.all(
      extraUsers.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
      )
    );
    await GroupFactory.withMembers(auth, group, extraUsers);

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const designGroup = groups.find(
      (g: { name: string }) => g.name === "Design"
    );
    expect(designGroup).toBeDefined();
    expect(designGroup.memberCount).toBe(2);

    // Global group count should include all workspace members.
    const globalGroup = groups.find(
      (g: { kind: string }) => g.kind === "global"
    );
    expect(globalGroup.memberCount).toBe(3); // 1 original + 2 extra.
  });

  it("returns 0 for a group with no members", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await GroupFactory.regular(workspace, "Empty");

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const emptyGroup = groups.find((g: { name: string }) => g.name === "Empty");
    expect(emptyGroup).toBeDefined();
    expect(emptyGroup.memberCount).toBe(0);
  });

  it("filters groups by kind", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regular(workspace, "Backend");
    await GroupFactory.withMembers(auth, group, [user]);

    const response = await getGroups(workspace, { kind: "regular" });

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    expect(groups.every((g: { kind: string }) => g.kind === "regular")).toBe(
      true
    );
    const backendGroup = groups.find(
      (g: { name: string }) => g.name === "Backend"
    );
    expect(backendGroup).toBeDefined();
    expect(backendGroup.memberCount).toBe(1);
  });
});
