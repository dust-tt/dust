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
    expect(body.awuStatus).toBe("normal");
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
    expect(body.awuStatus).toBe("blocked");
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
});
