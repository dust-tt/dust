import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { vi } from "vitest";

// Mock the getSession function to return the user without going through the workos session
vi.mock(import("../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

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
 * @param options.role Role to assign to the regular key ("user" | "builder" | "admin"). Ignored when systemKey is true. Defaults to "builder".
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
  role = "builder",
}: {
  systemKey?: boolean;
  method?: RequestMethod;
  role?: "user" | "builder" | "admin";
} = {}) => {
  const workspace = await WorkspaceFactory.basic();
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  let key;
  if (systemKey) {
    key = await KeyFactory.system(globalGroup);
  } else if (role === "user") {
    key = await KeyFactory.readOnly(globalGroup);
  } else if (role === "admin") {
    key = await KeyFactory.admin(globalGroup);
  } else {
    key = await KeyFactory.regular(globalGroup);
  }

  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method,
    query: { wId: workspace.sId },
    headers: {
      authorization: "Bearer " + key.secret,
    },
  });

  const auth = await Authenticator.fromKey(key, workspace.sId);

  return {
    auth: auth.workspaceAuth,
    req,
    res,
    workspace,
    globalGroup,
    systemGroup,
    key,
  };
};
