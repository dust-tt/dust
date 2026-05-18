import { describe, expect, it } from "vitest";

import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";

import { honoApp } from "@front-api/app";

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
});
