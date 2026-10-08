import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it, vi } from "vitest";

async function fetchLocale() {
  const response = await honoApp.request("/api/auth-context");
  expect(response.status).toBe(200);
  return (await response.json()).locale;
}

async function enableLocalisation(workspaceId: string) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);
  await FeatureFlagFactory.basic(adminAuth, "localisation");
}

describe("GET /api/auth-context locale", () => {
  it("returns no locale when the default workspace lacks the localisation flag", async () => {
    const { user } = await createPrivateApiMockRequest();
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await fetchLocale()).toBeUndefined();
  });

  it("returns the user locale when the default workspace has the localisation flag", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    await enableLocalisation(workspace.sId);
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");

    expect(await fetchLocale()).toBe("fr-FR");
  });

  it("falls back to the default workspace locale", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    await enableLocalisation(workspace.sId);
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    await workspaceResource?.updateWorkspaceSettings({ locale: "fr-FR" });

    expect(await fetchLocale()).toBe("fr-FR");
  });

  it("returns no locale when the session has no default workspace", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    await enableLocalisation(workspace.sId);
    await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");
    const { getWorkOSSessionWithSetCookies } =
      await import("@app/lib/api/workos/user");
    const { session } = await getWorkOSSessionWithSetCookies(undefined);
    assert(session, "Expected a mocked session.");
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: { ...session, workspaceId: undefined },
      setCookies: [],
    });

    expect(await fetchLocale()).toBeUndefined();
  });
});
