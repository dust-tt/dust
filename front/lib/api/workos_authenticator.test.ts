import { getAuthenticatorFromWorkOSClaims } from "@app/lib/api/workos_authenticator";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

function makeClaims({
  sub,
  orgId,
  exp = 1_700_000_000,
}: {
  sub: string;
  orgId?: string;
  exp?: number;
}) {
  return orgId === undefined ? { sub, exp } : { sub, exp, org_id: orgId };
}

describe("getAuthenticatorFromWorkOSClaims", () => {
  it("returns invalid_token_payload for malformed claims", async () => {
    const result = await getAuthenticatorFromWorkOSClaims({ sub: "user_123" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("invalid_token_payload");
    }
  });

  it("returns organization_missing when org_id is absent", async () => {
    const result = await getAuthenticatorFromWorkOSClaims(
      makeClaims({ sub: "user_123" })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("organization_missing");
    }
  });

  it("returns workspace_not_found when org_id is unknown", async () => {
    const result = await getAuthenticatorFromWorkOSClaims(
      makeClaims({ sub: "user_123", orgId: "org_does_not_exist" })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("workspace_not_found");
    }
  });

  it("returns user_not_found when the user does not exist", async () => {
    const workspace = await WorkspaceFactory.basic();

    const result = await getAuthenticatorFromWorkOSClaims(
      makeClaims({
        sub: "user_unknown",
        orgId: workspace.workOSOrganizationId!,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("user_not_found");
    }
  });

  it("returns not_a_member when the user is not in the workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.withWorkOSId("user_not_member");

    const result = await getAuthenticatorFromWorkOSClaims(
      makeClaims({
        sub: user.workOSUserId!,
        orgId: workspace.workOSOrganizationId!,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("not_a_member");
    }
  });

  it("returns a workspace-scoped authenticator for valid claims", async () => {
    const workspace = await WorkspaceFactory.basic();
    const workOSUserId = "user_member_123";
    const user = await UserFactory.withWorkOSId(workOSUserId);
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const result = await getAuthenticatorFromWorkOSClaims(
      makeClaims({
        sub: workOSUserId,
        orgId: workspace.workOSOrganizationId!,
      })
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.user().sId).toBe(user.sId);
      expect(result.value.workspace().sId).toBe(workspace.sId);
      expect(result.value.role()).toBe("user");
    }
  });
});
