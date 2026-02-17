import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { expectArrayOfObjectsWithSpecificLength } from "@app/tests/utils/utils";
import { describe, expect, it } from "vitest";

import handler from "./index";

describe("GET /api/v1/w/[wId]/data_sources (legacy endpoint)", () => {
  it("returns 500 if no global space exists", async () => {
    const { req, res } = await createPublicApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });

  it("returns data sources for the global space", async () => {
    const { req, res, workspace, globalGroup } =
      await createPublicApiMockRequest();

    const space = await SpaceFactory.global(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    // Create test data source views to the space
    await DataSourceViewFactory.folder(workspace, space);
    await DataSourceViewFactory.folder(workspace, space);

    // Create another space
    const space2 = await SpaceFactory.regular(workspace);

    // Create test data source views to the space (they should not be returned)
    await DataSourceViewFactory.folder(workspace, space2);

    // Execute request
    await handler(req, res);

    // Verify response
    expect(res._getStatusCode()).toBe(200);

    const { data_sources } = res._getJSONData();
    expectArrayOfObjectsWithSpecificLength(data_sources, 2);
  });
});
