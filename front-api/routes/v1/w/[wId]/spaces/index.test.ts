import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/w/:wId/spaces", () => {
  it("returns an empty list when no spaces exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ spaces: [] });
  });

  it("returns accessible spaces for the workspace", async () => {
    const { workspace, globalGroup, key } = await createPublicApiMockRequest();

    const globalSpace = await SpaceFactory.global(workspace);
    await SpaceFactory.system(workspace); // Not returned: public API keys are builders, not admins.
    const regularSpace1 = await SpaceFactory.regular(workspace);
    const regularSpace2 = await SpaceFactory.regular(workspace);
    await SpaceFactory.regular(workspace); // Distractor: not associated with the global group.

    await GroupSpaceFactory.associate(regularSpace1, globalGroup);
    await GroupSpaceFactory.associate(regularSpace2, globalGroup);

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    const { spaces } = await response.json();
    expectArrayOfObjectsWithSpecificLength(spaces, 3);
    expect(spaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: globalSpace.name, kind: "global" }),
        expect.objectContaining({ name: regularSpace1.name, kind: "regular" }),
        expect.objectContaining({ name: regularSpace2.name, kind: "regular" }),
      ])
    );
  });

  it("filters spaces by kinds when provided", async () => {
    const { workspace, globalGroup, key } = await createPublicApiMockRequest();

    await SpaceFactory.global(workspace);
    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces?kinds=regular`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    const { spaces } = await response.json();
    expectArrayOfObjectsWithSpecificLength(spaces, 1);
    expect(spaces).toEqual([
      expect.objectContaining({ name: regularSpace.name, kind: "regular" }),
    ]);
  });

  it("omits projects unless they are explicitly requested", async () => {
    const { workspace, globalGroup } = await createPublicApiMockRequest();

    await SpaceFactory.global(workspace);
    const project = await SpaceFactory.project(workspace);

    // A key is a workspace member, and the global group only ever reads a project, so the key has
    // to hold the project's own member group to be a member of it.
    const { members } = await project.fetchAssociatedGroups();
    const key = await KeyFactory.regular([globalGroup, ...members]);

    const defaultResponse = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(defaultResponse.status).toBe(200);
    const { spaces: defaultSpaces } = await defaultResponse.json();
    expectArrayOfObjectsWithSpecificLength(defaultSpaces, 1);
    expect(defaultSpaces).toEqual([
      expect.objectContaining({ kind: "global" }),
    ]);

    const projectResponse = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces?kinds=project`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(projectResponse.status).toBe(200);
    const { spaces: projectSpaces } = await projectResponse.json();
    expectArrayOfObjectsWithSpecificLength(projectSpaces, 1);
    expect(projectSpaces).toEqual([
      expect.objectContaining({ name: project.name, kind: "project" }),
    ]);
  });

  it("rejects invalid kinds", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces?kinds=bogus`,
      {
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(400);
  });
});
