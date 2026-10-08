import { Authenticator } from "@app/lib/auth";
import { usesCustomerCredentials } from "@app/lib/plans/plan_gateway";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("plan gateway", () => {
  it("exposes the edgee gateway on the authenticator of an Edgee-plan workspace", async () => {
    const workspace = await WorkspaceFactory.edgee();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(auth.getNonNullablePlan().gateway).toBe("edgee");
    expect(auth.toJSON().gateway).toBe("edgee");
  });

  it("exposes no gateway for a workspace on a default plan", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    expect(auth.getNonNullablePlan().gateway).toBeNull();
    expect(auth.toJSON().gateway).toBeNull();
  });
});

describe("usesCustomerCredentials", () => {
  it("is true for BYOK and gateway plans, false otherwise", () => {
    expect(usesCustomerCredentials({ isByok: true, gateway: null })).toBe(true);
    expect(usesCustomerCredentials({ isByok: false, gateway: "edgee" })).toBe(
      true
    );
    expect(usesCustomerCredentials({ isByok: false, gateway: null })).toBe(
      false
    );
  });
});
