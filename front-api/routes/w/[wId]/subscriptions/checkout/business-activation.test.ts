import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function get(workspace: { sId: string }, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  const suffix = qs ? `?${qs}` : "";
  return honoApp.request(
    `/api/w/${workspace.sId}/subscriptions/checkout/business-activation${suffix}`,
    { method: "GET" }
  );
}

describe("GET /api/w/:wId/subscriptions/checkout/business-activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await KillSwitchResource.disableKillSwitch(
      "global_disable_metronome_billing"
    );
  });

  it("returns 403 when metronome billing is killed", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );

    const response = await get(workspace, { setup_session_id: "cs_test" });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 403 when the legacy_billing flag is set", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await FeatureFlagFactory.basic(auth, "legacy_billing");

    const response = await get(workspace, { setup_session_id: "cs_test" });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("passes the metronome gate when billing is enabled (400 on missing identifier)", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // No contract_id / setup_session_id: the request clears the metronome gate
    // and fails on identifier validation instead of the 403 gate.
    const response = await get(workspace);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 403 when user is not admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await get(workspace, { setup_session_id: "cs_test" });

    expect(response.status).toBe(403);
  });

  it("lets a member with the billing admin permission through the auth gate", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "billing",
    });

    // No identifier: the caller clears the billing-permission gate and fails on
    // identifier validation (400) rather than on authorization.
    const response = await get(workspace);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
