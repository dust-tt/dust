import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());

vi.mock("@app/lib/api/redis", () => ({
  getRedisCacheClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      del: vi.fn().mockImplementation((keyOrKeys: string | string[]) => {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        keys.forEach((key) => inMemoryCache.delete(key));
        return Promise.resolve(keys.length);
      }),
    })
  ),
}));

vi.mock("@app/lib/utils/cache", () => ({
  cacheWithRedis: vi
    .fn()
    .mockImplementation(
      <T, Args extends unknown[]>(
        fn: CacheableFunction<JsonSerializable<T>, Args>,
        resolver: (...args: Args) => string
      ) => {
        return async (...args: Args): Promise<JsonSerializable<T>> => {
          const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
          const cached = inMemoryCache.get(key);
          if (cached) {
            return JSON.parse(cached) as JsonSerializable<T>;
          }
          const result = await fn(...args);
          inMemoryCache.set(key, JSON.stringify(result));
          return result;
        };
      }
    ),
  invalidateCacheWithRedis: vi
    .fn()
    .mockImplementation(
      <T, Args extends unknown[]>(
        fn: CacheableFunction<JsonSerializable<T>, Args>,
        resolver: (...args: Args) => string
      ) => {
        return async (...args: Args): Promise<void> => {
          const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
          inMemoryCache.delete(key);
        };
      }
    ),
  batchInvalidateCacheWithRedis: vi
    .fn()
    .mockImplementation(
      <T, Args extends unknown[]>(
        fn: CacheableFunction<JsonSerializable<T>, Args>,
        resolver: (...args: Args) => string
      ) => {
        return async (argsList: Args[]): Promise<void> => {
          for (const args of argsList) {
            const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
            inMemoryCache.delete(key);
          }
        };
      }
    ),
}));

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";

describe("GroupResource", () => {
  describe("listUserGroupModelIdsInWorkspace", () => {
    let workspace: WorkspaceType;
    let member: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
    });

    it("returns global group and explicit groups for a workspace member", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Test Group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await regularGroup.dangerouslyAddMembers(auth, {
        users: [member.toJSON()],
      });

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: member,
        workspace,
      });

      expect(groupIds.length).toBe(2);

      const globalGroup = await GroupModel.findOne({
        where: { workspaceId: workspace.id, kind: "global" },
      });
      expect(globalGroup).not.toBeNull();
      expect(groupIds).toContain(globalGroup!.id);
      expect(groupIds).toContain(regularGroup.id);
    });

    it("returns empty array for non-member", async () => {
      const nonMember = await UserFactory.basic();

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: nonMember,
        workspace,
      });

      expect(groupIds).toEqual([]);
    });

    it("returns groups for non-member when dangerouslySkipMembershipCheck is true", async () => {
      const nonMember = await UserFactory.basic();

      const groupIds = await GroupResource.listUserGroupModelIdsInWorkspace({
        user: nonMember,
        workspace,
        dangerouslySkipMembershipCheck: true,
      });

      // Should still return the global group even though the user is not a member.
      expect(groupIds.length).toBeGreaterThanOrEqual(1);
      const globalGroup = await GroupModel.findOne({
        where: { workspaceId: workspace.id, kind: "global" },
      });
      expect(groupIds).toContain(globalGroup!.id);
    });

    it("throws when global group is missing regardless of skip flag", async () => {
      // Delete the global group to simulate a data integrity issue.
      await GroupModel.destroy({
        where: { workspaceId: workspace.id, kind: "global" },
      });

      await expect(
        GroupResource.listUserGroupModelIdsInWorkspace({
          user: member,
          workspace,
        })
      ).rejects.toThrow("Global group not found.");

      await expect(
        GroupResource.listUserGroupModelIdsInWorkspace({
          user: member,
          workspace,
          dangerouslySkipMembershipCheck: true,
        })
      ).rejects.toThrow("Global group not found.");
    });
  });
});
