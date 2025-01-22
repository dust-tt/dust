import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { expect, it, vi } from "vitest";

import { SECRET_KEY_PREFIX } from "@app/lib/resources/key_resource";
import { groupFactory } from "@app/tests/utils/GroupFactory";
import { keyFactory } from "@app/tests/utils/KeyFactory";
import { withinTransaction } from "@app/tests/utils/utils";
import { workspaceFactory } from "@app/tests/utils/WorkspaceFactory";

// Mock the getSession function to return the user without going through the auth0 session
vi.mock(import("../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

type NextHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void> | void;

/**
 * Creates a mock request with authentication for testing public API endpoints.
 *
 * This helper sets up a test workspace with a global group and API key, then creates
 * a mock request authenticated with that key. Used to simulate authenticated API calls
 * in tests.
 *
 * @param options Configuration options
 * @param options.systemKey If true, creates a system API key instead of regular key (default: false)
 * @param options.method HTTP method to use for the request (default: "GET")
 * @returns Object containing:
 *   - req: Mocked NextApiRequest
 *   - res: Mocked NextApiResponse
 *   - workspace: Created test workspace
 *   - globalGroup: Created global group
 *   - key: Created API key
 */
export const createPublicApiMockRequest = async ({
  systemKey = false,
  method = "GET",
}: { systemKey?: boolean; method?: RequestMethod } = {}) => {
  const workspace = await workspaceFactory().basic().create();
  const globalGroup = await groupFactory().global(workspace).create();
  const key = systemKey
    ? await keyFactory().system(globalGroup).create()
    : await keyFactory().regular(globalGroup).create();

  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method,
    query: { wId: workspace.sId },
    headers: {
      authorization: "Bearer " + key.secret,
    },
  });

  return { req, res, workspace, globalGroup, key };
};

export function createPublicApiSystemOnlyAuthenticationTests(
  handler: NextHandler
) {
  return withinTransaction(() => {
    it("returns 404 if not system key", async () => {
      const { req, res } = await createPublicApiMockRequest();

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
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
    it("GET returns 401 if no key", async () => {
      const workspace = await workspaceFactory().basic().create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace.sId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({
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
      expect(res._getJSONData()).toEqual({
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
          authorization: `Bearer ${SECRET_KEY_PREFIX}some_valid_key`,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_api_key_error",
          message: "The API key provided is invalid or disabled.",
        },
      });
    });

    it("returns 404 when workspace undefined", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: undefined },
        headers: {
          authorization: `Bearer ${SECRET_KEY_PREFIX}some_valid_key`,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("returns 404 when workspace not a string", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: 1 },
        headers: {
          authorization: `Bearer ${SECRET_KEY_PREFIX}some_valid_key`,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("returns 401 when workspace does not exist", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: "does-not-exist" },
        headers: {
          authorization: `Bearer ${SECRET_KEY_PREFIX}some_valid_key`,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("returns 401 when workspace does not match the key", async () => {
      const workspace = await workspaceFactory().basic().create();
      const globalGroup = await groupFactory().global(workspace).create();
      const key = await keyFactory().regular(globalGroup).create();

      const workspace2 = await workspaceFactory().basic().create();

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { wId: workspace2.sId },
        headers: {
          authorization: `Bearer ${key.secret}`,
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });
}
