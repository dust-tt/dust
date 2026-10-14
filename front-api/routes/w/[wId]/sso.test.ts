import { deleteWorkOSOrganizationSSOConnection } from "@app/lib/api/workos/organization";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/workos/organization", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/workos/organization")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...mod,
    getWorkOSOrganizationSSOConnections: vi
      .fn()
      .mockResolvedValue(
        new Ok([{ id: "conn_test", state: "active", type: "OktaSAML" }])
      ),
    deleteWorkOSOrganizationSSOConnection: vi
      .fn()
      .mockResolvedValue(new Ok(undefined)),
  };
});

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "POST", role });
}

function enforceSso(workspace: { sId: string }, ssoEnforced: boolean) {
  return honoApp.request(`/api/w/${workspace.sId}/sso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssoEnforced }),
  });
}

describe("POST /api/w/:wId/sso", () => {
  it("lets an admin enforce SSO", async () => {
    const { workspace } = await setup();

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(200);
    expect((await response.json()).workspace.ssoEnforced).toBe(true);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });

  it("lets a member with the admin:security permission enforce SSO", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setup("user");

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "You do not have permission to manage identity and provisioning settings.",
      },
    });

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(false);
  });
});

// Enterprise workspace with a WorkOS organization, SSO enforced, and an admin signed in via SSO.
async function setupSsoEnforcedWorkspace() {
  const enterpriseWorkspace = await WorkspaceFactory.enterprise();
  const workspaceResource = await WorkspaceResource.fetchById(
    enterpriseWorkspace.sId
  );
  await workspaceResource?.updateWorkspaceSettings({
    workOSOrganizationId: "org_test",
    ssoEnforced: true,
  });

  const { workspace } = await createPrivateApiMockRequest({
    method: "DELETE",
    role: "admin",
    workspace: enterpriseWorkspace,
  });

  const { getWorkOSSessionWithSetCookies } =
    await import("@app/lib/api/workos/user");
  const { session } = await getWorkOSSessionWithSetCookies(undefined);
  assert(session, "Expected a mocked session.");
  vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
    session: { ...session, isSSO: true, authenticationMethod: "SSO" },
    setCookies: [],
  });

  return workspace;
}

function deleteSsoConnection(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/sso`, { method: "DELETE" });
}

describe("DELETE /api/w/:wId/sso", () => {
  it("disables SSO enforcement once the connection is deleted", async () => {
    const workspace = await setupSsoEnforcedWorkspace();

    const response = await deleteSsoConnection(workspace);

    expect(response.status).toBe(204);
    expect(deleteWorkOSOrganizationSSOConnection).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn_test" })
    );

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(false);
  });

  it("keeps SSO enforcement when the connection deletion fails", async () => {
    const workspace = await setupSsoEnforcedWorkspace();
    vi.mocked(deleteWorkOSOrganizationSSOConnection).mockResolvedValueOnce(
      new Err(new Error("WorkOS is down"))
    );

    const response = await deleteSsoConnection(workspace);

    expect(response.status).toBe(500);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });
});
