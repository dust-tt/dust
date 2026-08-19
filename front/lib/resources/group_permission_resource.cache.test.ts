import { getRedisCacheClient } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import type { GroupGrant } from "@app/lib/resources/group_permission_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { isString } from "@app/types/shared/utils/general";
import type { QueryOptions } from "sequelize";
import type { AbstractQuery } from "sequelize/types/dialects/abstract/query";
import { beforeEach, describe, expect, it } from "vitest";

function countGroupPermissionQueries(hookName: string): () => number {
  let count = 0;
  const captureQuery = (_options: QueryOptions, query: AbstractQuery) => {
    const sql = Reflect.get(query, "sql");
    if (isString(sql) && sql.includes('FROM "group_permissions"')) {
      count += 1;
    }
  };
  frontSequelize.addHook("afterQuery", hookName, captureQuery);
  return () => {
    frontSequelize.removeHook("afterQuery", hookName);
    return count;
  };
}

describe("group permissions cache", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let groupA: GroupResource;
  let groupB: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    groupA = await GroupFactory.regularAuto(workspace, "A");
    groupB = await GroupFactory.regularManual(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("serves a second read without touching the database", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 42,
    });

    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    const stopCounting = countGroupPermissionQueries("cache-hit-no-query");
    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    expect(stopCounting()).toBe(0);
    expect(grants).toEqual([
      {
        groupId: groupA.id,
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      },
    ]);
  });

  it("returns only the requested groups out of the workspace snapshot", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.grant(auth, {
      group: groupB,
      grantType: "member",
      resourceType: "space",
      resourceId: 2,
    });

    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupB.id] }
    );

    expect(grants).toEqual([
      {
        groupId: groupB.id,
        grantType: "member",
        resourceType: "space",
        resourceId: 2,
      },
    ]);
  });

  it("caches a group that holds no grant", async () => {
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupB.id] }
    );

    const stopCounting = countGroupPermissionQueries("cache-empty-group");
    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupB.id] }
    );

    expect(stopCounting()).toBe(0);
    expect(grants).toEqual([]);
  });

  it("caches the absence of a group that does not exist in the database", async () => {
    const missingGroupModelId = 987654321;

    const first = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [missingGroupModelId] }
    );
    expect(first).toEqual([]);

    // The field is written as an empty list, so the absence itself is a hit.
    const redis = await getRedisCacheClient({
      origin: "group_permissions_cache",
    });
    const cached = await redis.hmGet(
      GroupPermissionResource.cacheOperations.buildKey({
        workspaceModelId: String(auth.getNonNullableWorkspace().id),
      }),
      [String(missingGroupModelId)]
    );
    expect(cached).toEqual(["[]"]);

    const stopCounting = countGroupPermissionQueries("cache-absent-group");
    const second = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [missingGroupModelId] }
    );

    expect(stopCounting()).toBe(0);
    expect(second).toEqual([]);
  });

  it("queries only the groups it has not cached yet", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    const groupC = await GroupFactory.regularManual(workspace, "C");

    // Reading caches groupA; groupC is never read before the assertion.
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    let boundGroupModelIds: unknown;
    const captureQueryHook = "cache-partial-hit";
    frontSequelize.addHook(
      "afterQuery",
      captureQueryHook,
      (options: QueryOptions, query: AbstractQuery) => {
        const sql = Reflect.get(query, "sql");
        if (isString(sql) && sql.includes('FROM "group_permissions"')) {
          boundGroupModelIds = options.bind;
        }
      }
    );

    let grants: GroupGrant[];
    try {
      grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        { groupModelIds: [groupA.id, groupC.id] }
      );
    } finally {
      frontSequelize.removeHook("afterQuery", captureQueryHook);
    }

    expect(boundGroupModelIds).toEqual({ groupModelIds: [groupC.id] });
    expect(grants.map((grant) => grant.resourceId)).toEqual([1]);
  });

  it("applies the optional filters on the cached snapshot", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "member",
      resourceType: "space",
      resourceId: 2,
    });

    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      {
        groupModelIds: [groupA.id],
        grantType: "member",
        resourceType: "space",
        resourceId: 2,
      }
    );

    expect(grants).toEqual([
      {
        groupId: groupA.id,
        grantType: "member",
        resourceType: "space",
        resourceId: 2,
      },
    ]);
  });

  it("invalidates the cached grants when a grant is added", async () => {
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 7,
    });

    const stopCounting = countGroupPermissionQueries("cache-after-grant");
    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    expect(stopCounting()).toBe(1);
    expect(grants.map((grant) => grant.resourceId)).toEqual([7]);
  });

  it("invalidates the cached grants when a grant is revoked", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 7,
    });
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    await GroupPermissionResource.revoke(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 7,
    });

    const stopCounting = countGroupPermissionQueries("cache-after-revoke");
    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    expect(stopCounting()).toBe(1);
    expect(grants).toEqual([]);
  });

  it("invalidates the cached grants when a capability is disabled", async () => {
    await GroupPermissionResource.grantTypeWide(auth, {
      group: groupB,
      grantType: "create",
      resourceType: "agent",
    });
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupB.id] }
    );

    await GroupPermissionResource.disable(auth, {
      grantType: "create",
      resourceType: "agent",
    });

    const stopCounting = countGroupPermissionQueries("cache-after-disable");
    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupB.id] }
    );

    expect(stopCounting()).toBe(1);
    expect(grants).toEqual([]);
  });

  it("repopulates after the workspace key is flushed", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 5,
    });
    await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    const { getRedisCacheClient } = await import("@app/lib/api/redis");
    const redis = await getRedisCacheClient({
      origin: "group_permissions_cache",
    });
    await redis.del(
      GroupPermissionResource.cacheOperations.buildKey({
        workspaceModelId: String(auth.getNonNullableWorkspace().id),
      })
    );

    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds: [groupA.id] }
    );

    expect(grants.map((grant) => grant.resourceId)).toEqual([5]);
  });
});
