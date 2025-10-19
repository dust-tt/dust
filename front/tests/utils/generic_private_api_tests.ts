import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { vi } from "vitest";

import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types";

import { setupWorkOSMocks } from "./mocks/workos";

// Setup WorkOS mocks
setupWorkOSMocks();

// Mock the getSession function to return the user without going through the auth0 session
vi.mock(import("../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn(),
  };
});

import { Authenticator, getSession } from "../../lib/auth";

/**
 * Creates a mock request with authentication for testing private API endpoints.
 *
 * This helper sets up a test workspace with a user and membership, then creates
 * a mock request authenticated with that user. Used to simulate authenticated API calls
 * in tests.
 *
 * @param options Configuration options
 * @param options.method HTTP method to use for the request (default: "GET")
 * @param options.role Role to assign to the user in the workspace (default: "user")
 * @returns Object containing:
 *   - req: Mocked NextApiRequest
 *   - res: Mocked NextApiResponse
 *   - workspace: Created test workspace
 *   - user: Created test user
 *   - membership: Created workspace membership
 *   - globalGroup: Created global group for the workspace
 */
export const createPrivateApiMockRequest = async ({
  method = "GET",
  role = "user",
  isSuperUser = false,
}: {
  method?: RequestMethod;
  role?: MembershipRoleType;
  isSuperUser?: boolean;
} = {}) => {
  const workspace = await WorkspaceFactory.basic();
  const user = await (isSuperUser
    ? UserFactory.superUser()
    : UserFactory.basic());
  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);

  const membership = await MembershipFactory.associate(workspace, user, {
    role,
  });

  // Mock the getSession function to return the user without going through the auth0 session
  vi.mocked(getSession).mockReturnValue(
    Promise.resolve({
      type: "workos",
      sessionId: "test-session-id",
      user: {
        workOSUserId: user.workOSUserId!,
        auth0Sub: null,
        email: user.email!,
        email_verified: true,
        name: user.username!,
        nickname: user.username!,
        organizations: [],
      },
      authenticationMethod: "GoogleOAuth",
      isSSO: false,
      workspaceId: workspace.sId,
      organizationId: workspace.workOSOrganizationId ?? undefined,
      region: "us-central1",
    })
  );

  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method,
    query: { wId: workspace.sId },
    headers: {},
  });

  return {
    req,
    res,
    workspace,
    user,
    membership,
    globalGroup,
    systemGroup,
    authenticator: await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    ),
  };
};
