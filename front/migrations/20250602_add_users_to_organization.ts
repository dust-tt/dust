import type { Organization, User } from "@workos-inc/node";

import { getWorkOS } from "@app/lib/api/workos/client";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Fetches all WorkOS users with emails matching a specific domain
 */
async function fetchWorkOSUsersByDomain(
  domain: string[]
): Promise<Result<User[], Error>> {
  try {
    const workOS = getWorkOS();
    const allUsers: User[] = [];
    let after: string | undefined;

    do {
      const response = await workOS.userManagement.listUsers({
        after,
        organizationId: undefined,
        limit: 100, // WorkOS API limit
      });
      console.log("after", after);
      // Filter users by domain
      const domainUsers = response.data.filter(
        (user) =>
          user.email &&
          domain.some((d) =>
            user.email.toLowerCase().endsWith(`@${d.toLowerCase()}`)
          )
      );

      allUsers.push(...domainUsers);
      after = response.listMetadata?.after;
    } while (after);

    logger.info(
      { domain, userCount: allUsers.length },
      "Found WorkOS users for domain"
    );
    return new Ok(allUsers);
  } catch (error) {
    logger.error({ error, domain }, "Failed to fetch WorkOS users for domain");
    return new Err(error instanceof Error ? error : new Error("Unknown error"));
  }
}

/**
 * Gets information about a WorkOS organization
 */
async function getWorkOSOrganizationInfo(
  organizationId: string
): Promise<Result<Organization, Error>> {
  try {
    const workOS = getWorkOS();
    const organization =
      await workOS.organizations.getOrganization(organizationId);

    logger.info(
      { organizationId, organizationName: organization.name },
      "Retrieved organization info"
    );
    return new Ok(organization);
  } catch (error) {
    logger.error({ error, organizationId }, "Failed to get organization info");
    return new Err(error instanceof Error ? error : new Error("Unknown error"));
  }
}

/**
 * Main script function
 */
async function analyzeUsersForOrganization(
  organizationId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info(
    { organizationId, execute },
    "Starting user analysis for organization"
  );

  // Get organization info
  const orgResult = await getWorkOSOrganizationInfo(organizationId);
  if (orgResult.isErr()) {
    logger.error({ error: orgResult.error }, "Failed to get organization info");
    return;
  }

  const organization = orgResult.value;

  const workOS = getWorkOS();
  const members = await workOS.userManagement.listOrganizationMemberships({
    organizationId,
  });

  await workOS.organizations.updateOrganization({
    organization: organization.id,
    metadata: {
      region: "europe-west1",
    },
  });

  logger.info(
    { organization, membersCount: members.data.length },
    "Organization members"
  );

  // Fetch all users with the specified domain
  const usersResult = await fetchWorkOSUsersByDomain(
    organization.domains.map((d) => d.domain)
  );
  if (usersResult.isErr()) {
    logger.error({ error: usersResult.error }, "Failed to fetch users");
    return;
  }

  const users = usersResult.value;
  const userToMove = users.find(
    (user) => user.metadata.region === "us-central1"
  );

  if (userToMove) {
    console.log("userToMove", userToMove);
    // await workOS.userManagement.updateUser({
    //   userId: userToMove.id,
    //   metadata: { region: "europe-west1" },
    // });
  }
  logger.info({ userCount: users.length }, "Found users to analyze");

  if (users.length === 0) {
    logger.info("No users found with the specified domain");
    return;
  }
}

// Script configuration
makeScript(
  {
    organizationId: {
      alias: "o",
      describe: "WorkOS organization ID to analyze users for",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ organizationId, execute }, logger) => {
    await analyzeUsersForOrganization(organizationId, execute, logger);
  }
);
