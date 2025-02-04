import { describe, expect } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  expectArrayOfObjectsWithSpecificLength,
  itInTransaction,
} from "@app/tests/utils/utils";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/data_sources", () => {
  itInTransaction(
    "returns an empty list when no data sources exist",
    async (t) => {
      const { req, res, workspace, globalGroup } =
        await createPublicApiMockRequest();

      const space = await SpaceFactory.global(workspace, t);
      await GroupSpaceFactory.associate(space, globalGroup);

      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ data_sources: [] });
    }
  );

  itInTransaction(
    "returns accessible data sources for the space",
    async (t) => {
      const { req, res, workspace, globalGroup } =
        await createPublicApiMockRequest();

      const space = await SpaceFactory.global(workspace, t);
      await GroupSpaceFactory.associate(space, globalGroup);

      req.query.spaceId = space.sId;

      // Create test data source views to the space
      await DataSourceViewFactory.folder(workspace, space, t);
      await DataSourceViewFactory.folder(workspace, space, t);

      // Create another space
      const space2 = await SpaceFactory.regular(workspace, t);

      // Create test data source views to the space (they should not be returned)
      await DataSourceViewFactory.folder(workspace, space2, t);

      // Execute request
      await handler(req, res);

      // Verify response
      expect(res._getStatusCode()).toBe(200);

      const { data_sources } = res._getJSONData();
      expectArrayOfObjectsWithSpecificLength(data_sources, 2);
    }
  );
});
