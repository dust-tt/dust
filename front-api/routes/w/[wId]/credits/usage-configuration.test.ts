import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function usageConfigurationUrl(wId: string) {
  return `/api/w/${wId}/credits/usage-configuration`;
}

describe("/api/w/[wId]/credits/usage-configuration", () => {
  it("GET returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      usageConfigurationUrl(workspace.sId)
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("GET defaults the upgrade-request toggles to true when no config row exists", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(
      usageConfigurationUrl(workspace.sId)
    );

    expect(response.status).toBe(200);
    const { configuration } = await response.json();
    expect(configuration.allowMemberUpgradeRequests).toBe(true);
    expect(configuration.upgradeRequestEmailEnabled).toBe(true);
    expect(configuration.autoSeatUpgradeEnabled).toBe(false);
    // The default mock workspace is on a free (non-Metronome) plan, so
    // auto-upgrade is not available — the UI disables the toggle.
    expect(configuration.autoSeatUpgradeAvailable).toBe(false);
  });

  it("PATCH persists the upgrade-request toggles and GET reflects them", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const patchResponse = await honoApp.request(
      usageConfigurationUrl(workspace.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowMemberUpgradeRequests: false,
          upgradeRequestEmailEnabled: false,
        }),
      }
    );

    expect(patchResponse.status).toBe(200);
    const { configuration } = await patchResponse.json();
    expect(configuration.allowMemberUpgradeRequests).toBe(false);
    expect(configuration.upgradeRequestEmailEnabled).toBe(false);

    // Re-authenticate as an admin of the same workspace and confirm the change
    // was persisted.
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const getResponse = await honoApp.request(
      usageConfigurationUrl(workspace.sId)
    );
    const getBody = await getResponse.json();
    expect(getBody.configuration.allowMemberUpgradeRequests).toBe(false);
    expect(getBody.configuration.upgradeRequestEmailEnabled).toBe(false);
  });

  it("PATCH persists autoSeatUpgradeEnabled and GET reflects it", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const patchResponse = await honoApp.request(
      usageConfigurationUrl(workspace.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSeatUpgradeEnabled: true }),
      }
    );

    expect(patchResponse.status).toBe(200);
    const { configuration } = await patchResponse.json();
    expect(configuration.autoSeatUpgradeEnabled).toBe(true);
    // Untouched toggles keep their defaults.
    expect(configuration.allowMemberUpgradeRequests).toBe(true);

    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const getResponse = await honoApp.request(
      usageConfigurationUrl(workspace.sId)
    );
    const getBody = await getResponse.json();
    expect(getBody.configuration.autoSeatUpgradeEnabled).toBe(true);
  });

  it("PATCH returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await honoApp.request(
      usageConfigurationUrl(workspace.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMemberUpgradeRequests: false }),
      }
    );

    expect(response.status).toBe(403);
  });
});
