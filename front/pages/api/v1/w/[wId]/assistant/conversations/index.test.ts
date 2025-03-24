import type { RequestMethod } from "node-mocks-http";
import type { Transaction } from "sequelize";
import { describe, vi } from "vitest";
import { expect } from "vitest";

import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupMembershipFactory } from "@app/tests/utils/GroupMembershipFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import { DustUserEmailHeader } from "@app/types";

import handler from "./index";

/**
 * This mocks the module, and is where we'll mock the class' methods
 */
vi.mock(
  "../../../../../../../../../types/src/front/lib/core_api",
  async (importActual) => {
    return {
      /**
       * Require the actual module (optional)
       */
      ...(await importActual()),

      /**
       * The name here should match the name of the import.
       * Use `default` if the class is a default export.
       */
      CoreAPI: vi.fn().mockReturnValue({
        searchNodes: vi.fn().mockImplementation(() => {
          return {
            isErr: () => false,
            value: {
              nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
            },
          } as any;
        }),
        /*mockResolvedValue({
        isErr: () => false,
        value: {
          nodes: CORE_SEARCH_NODES_FAKE_RESPONSE,
        },
      } as any),*/
      }),
    };
  }
);

/**
 * Setup function that creates a test environment with:
 * - 4 users
 * - 1 company space (global)
 * - 2 restricted spaces (regular)
 *
 * Permission structure:
 * - All users have access to company space
 * - User 0 has access to restricted space 1
 * - User 1 has access to restricted space 2
 * - User 2 has access to both restricted spaces
 * - User 3 has access only to company space
 */
async function setupTest(t: Transaction, method: RequestMethod = "POST") {
  // Create mock request with workspace and global group
  const { req, res, workspace, globalGroup } = await createPublicApiMockRequest(
    {
      systemKey: true,
      method,
    }
  );

  // Create 4 users
  const users = await Promise.all([
    UserFactory.basic(), // user 1 - company + restricted space 1
    UserFactory.basic(), // user 2 - company + restricted space 2
    UserFactory.basic(), // user 3 - company + both restricted spaces
    UserFactory.basic(), // user 4 - company only
  ]);

  // Associate all users with the workspace
  await Promise.all(
    users.map((user) => MembershipFactory.associate(workspace, user, "user"))
  );

  // Create spaces: company (global) and 2 restricted (regular)
  const companySpace = await SpaceFactory.global(workspace, t);
  const space1 = await SpaceFactory.regular(workspace, t);
  const space2 = await SpaceFactory.regular(workspace, t);

  // Create groups for restricted spaces
  const group1 = await GroupFactory.regular(workspace);
  const group2 = await GroupFactory.regular(workspace);

  // Associate all users with company space via global group
  await GroupSpaceFactory.associate(companySpace, globalGroup);

  // Associate restricted spaces with their groups
  await GroupSpaceFactory.associate(space1, group1);
  await GroupSpaceFactory.associate(space2, group2);

  // Associate users with restricted spaces via their groups:
  // User 1 -> restricted space 1
  // User 2 -> restricted space 2
  // User 3 -> both restricted spaces
  // User 4 -> no restricted spaces (only company space via global group)

  // Create group memberships for restricted groups
  await Promise.all([
    GroupMembershipFactory.associate(workspace, group1, users[0], t),
    GroupMembershipFactory.associate(workspace, group2, users[1], t),
    GroupMembershipFactory.associate(workspace, group1, users[2], t),
    GroupMembershipFactory.associate(workspace, group2, users[2], t),
  ]);

  return {
    req,
    res,
    workspace,
    globalGroup,
    users,
    companySpace,
    space1,
    space2,
    group1,
    group2,
  };
}

describe("POST /api/v1/w/[wId]/assistant/conversations", () => {
  itInTransaction(
    "creates a new conversation and answers to user messages with agent mention",
    async (t) => {
      const { req, res, users } = await setupTest(t);

      req.headers[DustUserEmailHeader] = users[0].email;

      req.body = {
        blocking: true,
        message: {
          mentions: [{ configurationId: "gpt4" }],
          content: "Hello!",
          context: {
            username: users[0].username,
            timezone: "Europe/Paris",
          },
        },
      };

      await handler(req, res);

      console.log(res);
      console.log(res._getJSONData());
    }
  );
});
