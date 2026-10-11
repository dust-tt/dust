import { getFrameExportLocale } from "@app/lib/api/viz/frame_locale";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { describe, expect, it } from "vitest";

async function setWorkspaceLocale(workspaceId: string, locale: "fr-FR") {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  await workspace.updateWorkspaceSettings({ locale });
}

describe("getFrameExportLocale", () => {
  it("returns the default locale when the localisation flag is disabled", async () => {
    const { authenticator, user } = await createResourceTest({});
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await getFrameExportLocale(authenticator)).toBe("en-US");
  });

  it("returns the requester's locale when the localisation flag is enabled", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(authenticator, "localisation");
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "en-GB");
    await setWorkspaceLocale(workspace.sId, "fr-FR");
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    expect(await getFrameExportLocale(auth)).toBe("en-GB");
  });

  it("falls back to the workspace locale without a user locale or a user", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    await FeatureFlagFactory.basic(authenticator, "localisation");
    await setWorkspaceLocale(workspace.sId, "fr-FR");
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    expect(await getFrameExportLocale(userAuth)).toBe("fr-FR");
    expect(await getFrameExportLocale(adminAuth)).toBe("fr-FR");
  });
});
