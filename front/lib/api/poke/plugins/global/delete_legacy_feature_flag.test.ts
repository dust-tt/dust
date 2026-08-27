import { deleteLegacyFeatureFlagPlugin } from "@app/lib/api/poke/plugins/global/delete_legacy_feature_flag";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";
import { describe, expect, it } from "vitest";

const LEGACY_FLAG_NAME = "some_retired_flag";

describe("deleteLegacyFeatureFlagPlugin.execute", () => {
  it("deletes the rows of a legacy flag across every workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const otherWorkspace = await WorkspaceFactory.basic();

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const otherAuth = await Authenticator.internalAdminForWorkspace(
      otherWorkspace.sId
    );
    await FeatureFlagFactory.legacy(auth, LEGACY_FLAG_NAME);
    await FeatureFlagFactory.legacy(otherAuth, LEGACY_FLAG_NAME);

    const result = await deleteLegacyFeatureFlagPlugin.execute(auth, null, {
      feature: [LEGACY_FLAG_NAME],
    });

    expect(result.isOk()).toBe(true);
    await expect(
      FeatureFlagResource.countLegacyByName(LEGACY_FLAG_NAME)
    ).resolves.toBe(0);
  });

  it("leaves other flags untouched", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const [otherFlag] = WHITELISTABLE_FEATURES;

    await FeatureFlagFactory.legacy(auth, LEGACY_FLAG_NAME);
    await FeatureFlagFactory.basic(auth, otherFlag);

    const result = await deleteLegacyFeatureFlagPlugin.execute(auth, null, {
      feature: [LEGACY_FLAG_NAME],
    });

    expect(result.isOk()).toBe(true);
    const remaining = await FeatureFlagResource.listForWorkspace(workspace);
    expect(remaining.map((flag) => flag.name)).toEqual([otherFlag]);
  });

  it("refuses a flag that still exists in the codebase", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const [existingFlag] = WHITELISTABLE_FEATURES;

    await FeatureFlagFactory.basic(auth, existingFlag);

    const result = await deleteLegacyFeatureFlagPlugin.execute(auth, null, {
      feature: [existingFlag],
    });

    expect(result.isErr()).toBe(true);
    await expect(
      FeatureFlagResource.countLegacyByName(existingFlag)
    ).resolves.toBe(1);
  });
});
