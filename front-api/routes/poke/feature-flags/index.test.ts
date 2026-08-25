import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// Picked by position rather than by name so retiring a flag does not break these tests.
const [FLAG_A, FLAG_B, FLAG_C] = WHITELISTABLE_FEATURES;

const LEGACY_FLAG_NAME = "some_retired_flag";

async function enableLegacyFlagOn(workspace: WorkspaceType) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  await FeatureFlagFactory.legacy(auth, LEGACY_FLAG_NAME);
}

function listFeatureFlags() {
  return honoApp.request("/api/poke/feature-flags");
}

function listWorkspacesForFlag(flagName: string) {
  return honoApp.request(
    `/api/poke/feature-flags/${encodeURIComponent(flagName)}`
  );
}

describe("GET /api/poke/feature-flags", () => {
  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await listFeatureFlags();

    expect(response.status).toBe(401);
  });

  it("counts the workspaces each flag is enabled on", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    const otherWorkspace = await WorkspaceFactory.basic();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const otherAuth = await Authenticator.internalAdminForWorkspace(
      otherWorkspace.sId
    );
    await FeatureFlagFactory.basic(auth, FLAG_A);
    await FeatureFlagFactory.basic(otherAuth, FLAG_A);
    await FeatureFlagFactory.basic(auth, FLAG_B);

    const response = await listFeatureFlags();

    expect(response.status).toBe(200);
    const { featureFlags } = await response.json();

    const byName = new Map<string, { workspaceCount: number }>(
      featureFlags.map((flag: { name: string; workspaceCount: number }) => [
        flag.name,
        flag,
      ])
    );
    expect(byName.get(FLAG_A)?.workspaceCount).toBe(2);
    expect(byName.get(FLAG_B)?.workspaceCount).toBe(1);
    expect(byName.get(FLAG_C)?.workspaceCount).toBe(0);
  });

  it("reports every configured flag, with its stage and description", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await listFeatureFlags();

    expect(response.status).toBe(200);
    const { featureFlags } = await response.json();

    const names = featureFlags.map((flag: { name: string }) => flag.name);
    expect(names).toEqual(expect.arrayContaining([...WHITELISTABLE_FEATURES]));

    const flag = featureFlags.find((f: { name: string }) => f.name === FLAG_A);
    expect(flag.stage).not.toBeNull();
    expect(flag.description).not.toBeNull();
    expect(flag.globalRolloutPercentage).toBeNull();
  });

  it("surfaces flag rows whose name is no longer configured", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await enableLegacyFlagOn(workspace);

    const response = await listFeatureFlags();

    expect(response.status).toBe(200);
    const { featureFlags } = await response.json();

    const legacyFlag = featureFlags.find(
      (f: { name: string }) => f.name === LEGACY_FLAG_NAME
    );
    expect(legacyFlag).toMatchObject({
      name: LEGACY_FLAG_NAME,
      stage: null,
      description: null,
      workspaceCount: 1,
    });
  });
});

describe("GET /api/poke/feature-flags/:flagName", () => {
  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await listWorkspacesForFlag(FLAG_A);

    expect(response.status).toBe(401);
  });

  it("lists the workspaces the flag is enabled on", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    const otherWorkspace = await WorkspaceFactory.basic();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const otherAuth = await Authenticator.internalAdminForWorkspace(
      otherWorkspace.sId
    );
    await FeatureFlagFactory.basic(auth, FLAG_A);
    await FeatureFlagFactory.basic(otherAuth, FLAG_A);
    await FeatureFlagFactory.basic(auth, FLAG_B);

    const response = await listWorkspacesForFlag(FLAG_A);

    expect(response.status).toBe(200);
    const { workspaces, totalCount, globalRolloutPercentage } =
      await response.json();

    expect(totalCount).toBe(2);
    expect(globalRolloutPercentage).toBeNull();
    expect(workspaces).toHaveLength(2);
    expect(
      workspaces.map((w: { workspaceId: string }) => w.workspaceId)
    ).toEqual(expect.arrayContaining([workspace.sId, otherWorkspace.sId]));

    const entry = workspaces.find(
      (w: { workspaceId: string }) => w.workspaceId === workspace.sId
    );
    expect(entry.workspaceName).toBe(workspace.name);
    expect(entry.planCode).toEqual(expect.any(String));
    expect(entry.enabledAt).toEqual(expect.any(String));
  });

  it("returns an empty list for a configured flag no workspace has", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await listWorkspacesForFlag(FLAG_A);

    expect(response.status).toBe(200);
    const { workspaces, totalCount } = await response.json();
    expect(workspaces).toEqual([]);
    expect(totalCount).toBe(0);
  });

  it("returns 404 for a name that is neither configured nor in the database", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await listWorkspacesForFlag("not_a_flag_at_all");

    expect(response.status).toBe(404);
  });

  it("serves a legacy flag name that still has rows", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });
    await enableLegacyFlagOn(workspace);

    const response = await listWorkspacesForFlag(LEGACY_FLAG_NAME);

    expect(response.status).toBe(200);
    const { workspaces, totalCount } = await response.json();
    expect(totalCount).toBe(1);
    expect(workspaces[0].workspaceId).toBe(workspace.sId);
  });
});
