import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { groupFactory } from "@app/tests/utils/GroupFactory";
import { groupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { keyFactory } from "@app/tests/utils/KeyFactory";
import { spaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  expectArrayOfObjectsWithSpecificLength,
  withinTransaction,
} from "@app/tests/utils/utils";
import { workspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import handler from "./index";

describe(
  "handler",
  withinTransaction(async () => {
    it("returns 200 and an empty array", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().regular(globalGroup).create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
        headers: {
          authorization: "Bearer " + key.secret,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        spaces: [],
      });
    });

    it("returns 200 and an array of spaces", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().regular(globalGroup).create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
        headers: {
          authorization: "Bearer " + key.secret,
        },
      });

      const globalSpace = await spaceFactory().global(workspace).create();
      await spaceFactory().system(workspace).create();
      const regularSpace1 = await spaceFactory().regular(workspace).create();
      const regularSpace2 = await spaceFactory().regular(workspace).create();
      await spaceFactory().regular(workspace).create();

      await groupSpaceFactory().associate(regularSpace1, globalGroup);
      await groupSpaceFactory().associate(regularSpace2, globalGroup);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const response = JSON.parse(res._getData());

      expectArrayOfObjectsWithSpecificLength(response["spaces"], 3);

      expect(response["spaces"]).toEqual([
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
      ]);
    });
  })
);
