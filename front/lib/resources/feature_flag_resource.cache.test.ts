import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/cache", async () =>
  vi.importActual("@app/lib/utils/cache")
);

import { getRedisCacheClient } from "@app/lib/api/redis";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { setRequestStorageResolver } from "@app/types/shared/utils/request_context";

describe("feature flag resource caches", () => {
  beforeEach(() => {
    setRequestStorageResolver(null);
  });

  afterEach(() => {
    setRequestStorageResolver(null);
  });

  it("invalidates a workspace list after local flag mutations", async () => {
    const workspace = await WorkspaceFactory.basic();

    await expect(
      FeatureFlagResource.listForWorkspace(workspace)
    ).resolves.toEqual([]);

    await FeatureFlagResource.enable(workspace, "deepseek_feature");
    const enabled = await FeatureFlagResource.listForWorkspace(workspace);
    expect(enabled.map((flag) => flag.name)).toEqual(["deepseek_feature"]);
    expect(enabled[0]?.createdAt).toBeInstanceOf(Date);

    await FeatureFlagResource.disable(workspace, "deepseek_feature");
    await expect(
      FeatureFlagResource.listForWorkspace(workspace)
    ).resolves.toEqual([]);
  });

  it("invalidates the global list after rollout mutations", async () => {
    await expect(GlobalFeatureFlagResource.listAll()).resolves.toEqual([]);

    await GlobalFeatureFlagResource.setRolloutPercentage(
      "labs_transcripts",
      50
    );
    const enabled = await GlobalFeatureFlagResource.listAll();
    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.name).toBe("labs_transcripts");
    expect(enabled[0]?.rolloutPercentage).toBe(50);

    await GlobalFeatureFlagResource.setRolloutPercentage("labs_transcripts", 0);
    await expect(GlobalFeatureFlagResource.listAll()).resolves.toEqual([]);
  });

  it("falls back to the database when the cache is unavailable", async () => {
    const workspace = await WorkspaceFactory.basic();
    await FeatureFlagResource.enable(workspace, "deepseek_feature");
    vi.mocked(getRedisCacheClient).mockRejectedValueOnce(
      new Error("Redis unavailable")
    );

    const flags = await FeatureFlagResource.listForWorkspace(workspace);

    expect(flags.map((flag) => flag.name)).toEqual(["deepseek_feature"]);
  });

  it("invalidates every affected workspace after a bulk disable", async () => {
    const firstWorkspace = await WorkspaceFactory.basic();
    const secondWorkspace = await WorkspaceFactory.basic();
    await FeatureFlagResource.enable(firstWorkspace, "deepseek_feature");
    await FeatureFlagResource.enable(secondWorkspace, "deepseek_feature");
    await FeatureFlagResource.listForWorkspace(firstWorkspace);
    await FeatureFlagResource.listForWorkspace(secondWorkspace);
    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    vi.mocked(redis.eval).mockClear();

    await expect(
      FeatureFlagResource.disableForAllWorkspaces("deepseek_feature")
    ).resolves.toBe(2);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      expect.objectContaining({
        keys: expect.arrayContaining([
          expect.stringContaining(String(firstWorkspace.id)),
          expect.stringContaining(String(secondWorkspace.id)),
        ]),
      })
    );
    await expect(
      FeatureFlagResource.listForWorkspace(firstWorkspace)
    ).resolves.toEqual([]);
    await expect(
      FeatureFlagResource.listForWorkspace(secondWorkspace)
    ).resolves.toEqual([]);
  });
});
