import { describe, expect, it } from "vitest";

import { SpaceResource } from "@app/lib/resources/space_resource";
import { dataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { groupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { spaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  expectArrayOfObjectsWithSpecificLength,
  withinTransaction,
} from "@app/tests/utils/utils";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe(
  "GET /api/v1/w/[wId]/spaces/[spaceId]/data_sources",
  withinTransaction(async () => {
    it("returns an empty list when no data sources exist", async () => {
      const { req, res, workspace, globalGroup } =
        await createPublicApiMockRequest();

      const space = await spaceFactory().global(workspace).create();
      await groupSpaceFactory().associate(space, globalGroup);

      req.query.spaceId = SpaceResource.modelIdToSId({
        id: space.id,
        workspaceId: workspace.id,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ data_sources: [] });
    });

    it("returns accessible data sources for the space", async () => {
      const { req, res, workspace, globalGroup } =
        await createPublicApiMockRequest();

      const space = await spaceFactory().global(workspace).create();
      await groupSpaceFactory().associate(space, globalGroup);

      req.query.spaceId = SpaceResource.modelIdToSId({
        id: space.id,
        workspaceId: workspace.id,
      });

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
  })
);
