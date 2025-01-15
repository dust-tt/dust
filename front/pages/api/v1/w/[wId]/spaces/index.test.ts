import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { featureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { groupFactory } from "@app/tests/utils/GroupFactory";
import { keyFactory } from "@app/tests/utils/KeyFactory";
import { spaceFactory } from "@app/tests/utils/SpaceFactory";
import { withTestDatabase } from "@app/tests/utils/utils";
import { workspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import handler from "./index";

describe(
  "handler",
  withTestDatabase(frontSequelize, async () => {
    it("returns 400 if dsId is not a string", async () => {
      const workspace = await workspaceFactory().basic().create();
      const space = await spaceFactory().global(workspace).create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: {
          wId: workspace.sId,
          spaceId: SpaceResource.modelIdToSId({
            id: space.id,
            workspaceId: workspace.id,
          }),
          dsId: 1,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Invalid query parameters, `dsId` (string) is required.",
        },
      });
    });
  })
);
