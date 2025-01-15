import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";
import handler from "@app/pages/api/v1/w/[wId]/feature_flags";
import { featureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { groupFactory } from "@app/tests/utils/GroupFactory";
import { keyFactory } from "@app/tests/utils/KeyFactory";
import { withTestDatabase } from "@app/tests/utils/withTestDatabase";
import { workspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe(
  "/api/v1/w/[wId]/feature_flags",
  withTestDatabase(frontSequelize, async () => {
    it("returns 404 if not system key", async () => {
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

      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData())).toEqual({
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    });

    it("returns 401 if disabled key", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().disabled(globalGroup).create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
        headers: {
          authorization: "Bearer " + key.secret,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: {
          type: "invalid_api_key_error",
          message: "The API key provided is invalid or disabled.",
        },
      });
    });

    it("returns 200 and an array if system key", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().system(globalGroup).create();

      // Add features flag
      await featureFlagFactory().basic("deepseek_feature", workspace).create();
      await featureFlagFactory().basic("document_tracker", workspace).create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
        headers: {
          authorization: "Bearer " + key.secret,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual(
        expect.objectContaining({
          feature_flags: ["deepseek_feature", "document_tracker"],
        })
      );
    });

    it("any other methods will return 405", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().system(globalGroup).create();

      for (const method of ["PUT", "DELETE", "PATCH"] as const) {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: method,
          query: { wId: workspace.sId },
          headers: {
            authorization: "Bearer " + key.secret,
          },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        expect(JSON.parse(res._getData())).toEqual({
          error: {
            type: "method_not_supported_error",
            message: "The method passed is not supported, GET is expected.",
          },
        });
      }
    });
  })
);
