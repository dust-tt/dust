import { describe, expect } from "vitest";

import { dataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { groupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { spaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  expectArrayOfObjectsWithSpecificLength,
  itInTransaction,
} from "@app/tests/utils/utils";

import handler from "./index";

describe("GET /api/v1/w/[wId]/data_sources (legacy endpoint)", () => {
  itInTransaction("returns 500 if no global space exists", async () => {
    const { req, res } = await createPublicApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });

  itInTransaction("returns data sources for the global space", async () => {
    const { req, res, workspace, globalGroup } =
      await createPublicApiMockRequest();

    const space = await spaceFactory().global(workspace).create();
    await groupSpaceFactory().associate(space, globalGroup);

    // Create test data source views to the space
    await dataSourceViewFactory().folder(workspace, space).create();
    await dataSourceViewFactory().folder(workspace, space).create();

    // Create another space
    const space2 = await spaceFactory().regular(workspace).create();

    // Create test data source views to the space (they should not be returned)
    await dataSourceViewFactory().folder(workspace, space2).create();

    // Execute request
    await handler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);

    const { data_sources } = res._getJSONData();
    expectArrayOfObjectsWithSpecificLength(data_sources, 2);
  });
});
