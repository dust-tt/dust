import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchMembers(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces/${spaceId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/spaces/:spaceId/members", () => {
  it("blocks making a restricted project open when open projects are disabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    await WorkspaceResource.updateMetadata(workspace.id, {
      ...(workspace.metadata ?? {}),
      allowOpenProjects: false,
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchMembers(workspace, project.sId, {
      name: project.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [],
      editorIds: [user.sId],
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Open projects are disabled by your workspace admin. Keep this project private.",
      },
    });
  });

  it("allows making a restricted project open when open projects are allowed", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchMembers(workspace, project.sId, {
      name: project.name,
      isRestricted: false,
      managementMode: "manual",
      memberIds: [],
      editorIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.space).toEqual(
      expect.objectContaining({
        sId: project.sId,
      })
    );
  });
});
