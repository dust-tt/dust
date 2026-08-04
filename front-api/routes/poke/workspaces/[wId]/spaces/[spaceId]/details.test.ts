import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function detailsUrl(workspaceId: string, spaceId: string) {
  return `/api/poke/workspaces/${workspaceId}/spaces/${spaceId}/details`;
}

describe("GET /api/poke/workspaces/:wId/spaces/:spaceId/details", () => {
  it("returns the sandbox provider id and status when the pod owns one", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace);
    const sandbox = await SandboxFactory.createForPod(auth, pod);

    const response = await honoApp.request(detailsUrl(workspace.sId, pod.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sandbox).toEqual({
      providerId: sandbox.providerId,
      status: "running",
    });
  });

  it("returns a null sandbox when the pod owns none", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace);

    const response = await honoApp.request(detailsUrl(workspace.sId, pod.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sandbox).toBeNull();
  });

  it("returns a null sandbox for a regular space", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const space = await SpaceFactory.regular(workspace);

    const response = await honoApp.request(
      detailsUrl(workspace.sId, space.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sandbox).toBeNull();
  });
});
