import {
  getPokeCacheCatalog,
  getPokeCacheOperations,
} from "@front-api/lib/api/poke/cache_catalog";
import { describe, expect, it } from "vitest";

describe("Poke cache catalog", () => {
  it("uses owner-defined operations for migrated caches", () => {
    const workspace = getPokeCacheOperations("workspace_by_sid");
    const activeSeats = getPokeCacheOperations("workspace_active_seats");

    expect(workspace?.buildKey({ wId: "workspace-1" })).toBe(
      "cacheWithRedis-workspace_by_sid-v3:workspace-1"
    );
    expect(activeSeats?.buildKey({ workspaceId: "workspace-1" })).toBe(
      "cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:workspace-1"
    );
  });

  it("keeps legacy cache descriptors available during migration", () => {
    const user = getPokeCacheOperations("user_by_workos_id");

    expect(user?.buildKey({ workOSUserId: "workos-user-1" })).toBe(
      "cacheWithRedis-_fetchByWorkOSUserIdUncached-user:workos:workos-user-1"
    );
  });

  it("lists each cache exactly once", () => {
    const catalog = getPokeCacheCatalog();
    const ids = catalog.map((entry) => entry.id);

    expect(ids.filter((id) => id === "workspace_by_sid")).toHaveLength(1);
    expect(ids.filter((id) => id === "workspace_active_seats")).toHaveLength(1);
  });

  it("keeps the previous active-seats id as a compatibility alias", () => {
    const activeSeats = getPokeCacheOperations("membership_seats");

    expect(activeSeats?.description.id).toBe("workspace_active_seats");
  });
});
