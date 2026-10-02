import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

function lookup(flow: string) {
  return honoApp.request(`/api/workspace-lookup?flow=${flow}`);
}

describe("GET /api/workspace-lookup", () => {
  it("returns only the name of the non-member workspace owning the user's e-mail domain", async () => {
    const { user } = await createPrivateApiMockRequest();
    const [, userEmailDomain] = user.email.split("@");

    const otherWorkspace = await WorkspaceFactory.basic();
    const otherWorkspaceResource = await WorkspaceResource.fetchById(
      otherWorkspace.sId
    );
    const upsertRes = await otherWorkspaceResource?.upsertWorkspaceDomain({
      domain: userEmailDomain,
    });
    expect(upsertRes?.isOk()).toBe(true);

    const response = await lookup("no-auto-join");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: { name: otherWorkspace.name },
      status: "auto-join-disabled",
      workspaceVerifiedDomain: userEmailDomain,
    });
  });

  it("returns 404 when no workspace owns the user's e-mail domain", async () => {
    await createPrivateApiMockRequest();

    const response = await lookup("no-auto-join");

    expect(response.status).toBe(404);
  });

  it("returns only the name of the revoked workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await lookup("revoked");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: { name: workspace.name },
      status: "revoked",
      workspaceVerifiedDomain: null,
    });
  });
});
