import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/w/:wId/auth-context group management", () => {
  it("returns only eligible managed groups when enabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const manual = await GroupResource.makeNew({
      name: "Support",
      kind: "regular_manual",
      workspaceId: workspace.id,
    });
    const adminGroup = await GroupResource.makeNew({
      name: "Admins",
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole: "admin",
    });
    for (const group of [manual, adminGroup]) {
      const result = await GroupPermissionResource.grantToUser(adminAuth, {
        user: user.toJSON(),
        grantType: "group_manager",
        resourceType: "group",
        resourceId: group.id,
      });
      expect(result.isOk()).toBe(true);
    }

    const url = `/api/w/${workspace.sId}/auth-context`;
    expect(
      (await (await honoApp.request(url)).json()).groupManagement
    ).toBeUndefined();

    await FeatureFlagFactory.basic(adminAuth, "group_management");
    const response = await honoApp.request(url);
    expect(response.status).toBe(200);
    const { groupManagement } = await response.json();
    expect(groupManagement.write).toEqual({
      kind: "ids",
      groupIds: [manual.sId],
    });
    expect(new Set(groupManagement.read_usage.groupIds)).toEqual(
      new Set([manual.sId, adminGroup.sId])
    );
    expect(new Set(groupManagement.set_usage_limits.groupIds)).toEqual(
      new Set([manual.sId, adminGroup.sId])
    );
  });
});

describe("GET /api/w/:wId/auth-context user locale", () => {
  async function fetchLocales(workspaceId: string) {
    const response = await honoApp.request(
      `/api/w/${workspaceId}/auth-context`
    );
    expect(response.status).toBe(200);
    const { locale, userLocale } = await response.json();
    return { locale, userLocale };
  }

  it("falls back to the workspace locale", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    await workspaceResource?.updateWorkspaceSettings({ locale: "fr-FR" });

    expect(await fetchLocales(workspace.sId)).toEqual({
      locale: "fr-FR",
      userLocale: null,
    });

    await user.setMetadata(USER_LOCALE_METADATA_KEY, "de-DE");
    expect(await fetchLocales(workspace.sId)).toEqual({
      locale: "fr-FR",
      userLocale: null,
    });
  });

  it("returns the locale stored in the user metadata", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await fetchLocales(workspace.sId)).toEqual({
      locale: "fr-FR",
      userLocale: "fr-FR",
    });
  });
});

describe("GET /api/w/:wId/auth-context collab URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns no collab URL where live editing is not deployed", async () => {
    vi.spyOn(config, "getCollabPublicUrl").mockReturnValue(undefined);
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/auth-context`
    );

    expect((await response.json()).collabUrl).toBeUndefined();
  });

  it("returns the cell's collab URL where it is deployed", async () => {
    vi.spyOn(config, "getCollabPublicUrl").mockReturnValue(
      "wss://dust.tt/api/collab"
    );
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/auth-context`
    );

    expect((await response.json()).collabUrl).toBe("wss://dust.tt/api/collab");
  });
});
