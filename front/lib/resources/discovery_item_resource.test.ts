import type { Authenticator } from "@app/lib/auth";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it } from "vitest";

describe("DiscoveryItemResource", () => {
  let auth: Authenticator;
  let groupModelId: number;
  let user: UserResource;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "manager" });
    auth = setup.authenticator;
    groupModelId = setup.globalGroup.id;
    user = setup.user;
  });

  it("sets pins independently and lists them by position", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: "skl_c", position: 2 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_a", position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_b", position: 1 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map((item) => item.position)).toEqual([0, 1, 2]);
    expect(listed.map((item) => item.itemId)).toEqual([
      "agt_a",
      "agt_b",
      "skl_c",
    ]);
  });

  it("replaces only the selected position", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_a", position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: "skl_kept", position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: "skl_replacement", position: 0 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map((item) => item.itemId)).toEqual([
      "skl_replacement",
      "skl_kept",
    ]);
  });

  it("moves an existing item and removes only the requested position", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_moved", position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: "skl_kept", position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_moved", position: 2 },
    });
    const removed = await DiscoveryItemResource.removePinnedForGroup(auth, {
      groupModelId,
      position: 1,
    });
    expect(removed.isOk() && removed.value).toBe(1);

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map((item) => [item.position, item.itemId])).toEqual([
      [2, "agt_moved"],
    ]);
  });

  it("rejects an invalid position without changing existing pins", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_kept", position: 0 },
    });

    const rejected = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: "skl_invalid", position: 3 },
    });
    expect(rejected.isErr()).toBe(true);

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map((item) => item.itemId)).toEqual(["agt_kept"]);
  });

  it("lists pins across the authenticated groups with the global group first", async () => {
    const group = await GroupFactory.regularManual(
      auth.getNonNullableWorkspace(),
      "Pinned audience"
    );
    await GroupFactory.withMembers(auth, group, [user]);
    await auth.refresh();

    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId: group.id,
      item: { type: "skill", itemId: "skl_group", position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: "agt_global", position: 0 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map((item) => item.itemId)).toEqual([
      "agt_global",
      "skl_group",
    ]);

    const groupPins = await DiscoveryItemResource.listPinnedForGroup(auth, {
      groupModelId: group.id,
    });
    expect(groupPins.map((item) => item.itemId)).toEqual(["skl_group"]);
  });

  it("rejects pin mutations from regular users", async () => {
    const setup = await createResourceTest({ role: "user" });

    const result = await DiscoveryItemResource.setPinnedForGroup(
      setup.authenticator,
      {
        groupModelId: setup.globalGroup.id,
        item: { type: "agent", itemId: "agt_forbidden", position: 0 },
      }
    );

    expect(result.isErr() && result.error.code).toBe("unauthorized");
  });
});
