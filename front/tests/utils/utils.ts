import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import type { Transaction } from "sequelize";
import { afterAll, beforeAll, expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";
import { groupFactory } from "@app/tests/utils/GroupFactory";
import { keyFactory } from "@app/tests/utils/KeyFactory";
import { workspaceFactory } from "@app/tests/utils/WorkspaceFactory";

type NextHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void> | void;

export const expectArrayOfObjectsWithSpecificLength = (
  value: any,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    value.every((item: unknown) => typeof item === "object" && item !== null)
  ).toBe(true);
};

// Wrapper to make sure that each test suite has a clean database
export const withinTransaction = (testSuite) => {
  return async () => {
    let transaction: Transaction;

    beforeAll(async () => {
      try {
        transaction = await frontSequelize.transaction();
      } catch (error) {
        console.error("Failed to start transaction:", error);
        throw error;
      }
    });

    afterAll(async () => {
      try {
        await transaction.rollback();
      } catch (error) {
        console.error("Failed to rollback transaction:", error);
        throw error;
      }
    });

    await testSuite();
  };
};

export function createPublicApiSystemOnlyAuthenticationTests(
  handler: NextHandler
) {
  return withinTransaction(() => {
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
  });
}

export function createPublicApiAuthenticationTests(handler: NextHandler) {
  return withinTransaction(() => {
    it("returns 401 if no key", async () => {
      const workspace = await workspaceFactory().basic().create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: {
          type: "not_authenticated",
          message:
            "The request does not have valid authentication credentials.",
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

    it("returns 401 if invalid key", async () => {
      const workspace = await workspaceFactory().basic().create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
        headers: {
          authorization: "Bearer " + "sk-fakekey",
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
  });
}
