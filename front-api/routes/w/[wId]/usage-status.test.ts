import { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function usageStatusUrl(wId: string) {
  return `/api/w/${wId}/usage-status`;
}

function upgradeRequestsUrl(wId: string) {
  return `/api/w/${wId}/credits/upgrade-requests`;
}

async function creditPricedWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.creditPriced();
}

describe("/api/w/[wId]/usage-status", () => {
  it("reports no upgrade availability on a non-credit-priced workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(usageStatusUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.userNearCreditLimit).toBe(false);
    expect(body.userBlockedReason).toBeNull();
    expect(body.canRequestUpgrade).toBe(false);
    expect(body.hasPendingUpgradeRequest).toBe(false);
  });

  it("lets a capped non-admin member request an upgrade", async () => {
    const workspace = await creditPricedWorkspace();
    const { membership } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    await membership.updateCreditState("capped");

    const response = await honoApp.request(usageStatusUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.userBlockedReason).toBe("user_cap_reached");
    expect(body.canRequestUpgrade).toBe(true);
    expect(body.hasPendingUpgradeRequest).toBe(false);
  });

  it("flips hasPendingUpgradeRequest once a request exists", async () => {
    const workspace = await creditPricedWorkspace();
    const { membership } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    await membership.updateCreditState("capped");

    const postResponse = await honoApp.request(
      upgradeRequestsUrl(workspace.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(postResponse.status).toBe(200);

    const response = await honoApp.request(usageStatusUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canRequestUpgrade).toBe(true);
    expect(body.hasPendingUpgradeRequest).toBe(true);
  });

  it("still offers the upgrade request when auto-upgrade is on but no higher seat is available", async () => {
    const workspace = await creditPricedWorkspace();

    // Auto-upgrade is enabled, but the test workspace has no entitled higher
    // seat tier (no Metronome contract), so the member can't be auto-upgraded
    // and must keep the manual request CTA.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await CreditUsageConfigurationResource.makeNew(adminAuth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      autoSeatUpgradeEnabled: true,
    });

    const { membership } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    await membership.updateCreditState("capped");

    const response = await honoApp.request(usageStatusUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canRequestUpgrade).toBe(true);
  });

  it("does not offer upgrade requests to admins", async () => {
    const workspace = await creditPricedWorkspace();
    const { membership } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });
    await membership.updateCreditState("capped");

    const response = await honoApp.request(usageStatusUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canRequestUpgrade).toBe(false);
  });

  it("hides the CTA and rejects requests when the workspace disables them", async () => {
    const workspace = await creditPricedWorkspace();

    // Turn the member upgrade-request toggle off on the workspace config
    // (Does not use the endpoint to avoid the metronome round trip)
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await CreditUsageConfigurationResource.makeNew(adminAuth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      allowMemberUpgradeRequests: false,
    });

    // A capped member no longer sees the CTA.
    const { membership } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    await membership.updateCreditState("capped");

    const statusResponse = await honoApp.request(usageStatusUrl(workspace.sId));
    expect(statusResponse.status).toBe(200);
    expect((await statusResponse.json()).canRequestUpgrade).toBe(false);

    // And a direct POST is rejected.
    const postResponse = await honoApp.request(
      upgradeRequestsUrl(workspace.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(postResponse.status).toBe(403);
  });
});
