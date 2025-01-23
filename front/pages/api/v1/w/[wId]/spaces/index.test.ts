import { describe, expect } from "vitest";

import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { groupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { spaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  expectArrayOfObjectsWithSpecificLength,
  itInTransaction,
} from "@app/tests/utils/utils";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/spaces", () => {
  itInTransaction("returns an empty list when no spaces exist", async () => {
    const { req, res } = await createPublicApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ spaces: [] });
  });

  itInTransaction("returns accessible spaces for the workspace", async () => {
    // Setup
    const { req, res, workspace, globalGroup } =
      await createPublicApiMockRequest();

    // Create test spaces
    const globalSpace = await spaceFactory().global(workspace).create();
    await spaceFactory().system(workspace).create(); // System spaces should not be returned unless your are admin (public api keys are builders)
    const regularSpace1 = await spaceFactory().regular(workspace).create();
    const regularSpace2 = await spaceFactory().regular(workspace).create();
    await spaceFactory().regular(workspace).create(); // Unassociated space

    // Associate spaces with the global group
    await groupSpaceFactory().associate(regularSpace1, globalGroup);
    await groupSpaceFactory().associate(regularSpace2, globalGroup);

    // Execute request
    await handler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);

    const { spaces } = res._getJSONData();
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
