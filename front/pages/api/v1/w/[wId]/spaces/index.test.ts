import { callApi } from "@app/tests/utils/api_request";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";
import { describe, expect, it } from "vitest";

import handler from "./index";

const ROUTE = "/api/v1/w/:wId/spaces";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/spaces", () => {
  it("returns an empty list when no spaces exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await callApi({
      route: ROUTE,
      params: { wId: workspace.sId },
      bearerToken: key.secret,
      nextHandler: handler,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ spaces: [] });
  });

  it("returns accessible spaces for the workspace", async () => {
    const { workspace, globalGroup, key } = await createPublicApiMockRequest();

    // Create test spaces
    const globalSpace = await SpaceFactory.global(workspace);
    await SpaceFactory.system(workspace); // System spaces should not be returned unless your are admin (public api keys are builders)
    const regularSpace1 = await SpaceFactory.regular(workspace);
    const regularSpace2 = await SpaceFactory.regular(workspace);
    await SpaceFactory.regular(workspace); // Unassociated space

    // Associate spaces with the global group
    await GroupSpaceFactory.associate(regularSpace1, globalGroup);
    await GroupSpaceFactory.associate(regularSpace2, globalGroup);

    const response = await callApi({
      route: ROUTE,
      params: { wId: workspace.sId },
      bearerToken: key.secret,
      nextHandler: handler,
    });

    expect(response.status).toBe(200);

    const { spaces } = response.body;
    expectArrayOfObjectsWithSpecificLength(spaces, 3);

    expect(spaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: globalSpace.name,
          kind: "global",
        }),
        expect.objectContaining({
          name: regularSpace1.name,
          kind: "regular",
        }),
        expect.objectContaining({
          name: regularSpace2.name,
          kind: "regular",
        }),
      ])
    );
  });
});
