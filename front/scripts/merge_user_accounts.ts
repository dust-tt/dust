import type { PostIdentitiesRequestProviderEnum } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function mergeAccountsForUser(
  {
    primaryUserId,
    secondaryUserId,
  }: {
    primaryUserId: string;
    secondaryUserId: string;
  },
  execute: boolean,
  logger: Logger
) {
  if (primaryUserId === secondaryUserId) {
    throw new Error("Primary and secondary user IDs are the same.");
  }

  const primaryUser = await UserResource.fetchById(primaryUserId);
  const secondaryUser = await UserResource.fetchById(secondaryUserId);

  if (!primaryUser || !secondaryUser) {
    throw new Error("Primary or secondary user not found.");
  }

  if (primaryUser.email !== secondaryUser.email) {
    throw new Error("Primary and secondary user emails do not match.");
  }

  const auth0ManagemementClient = getAuth0ManagemementClient();

  const users = await auth0ManagemementClient.usersByEmail.getByEmail({
    email: primaryUser.email.toLowerCase(),
  });

  const primaryUserAuth0 = users.data.find(
    (u) => u.user_id === primaryUser.auth0Sub
  );
  const secondaryUserAuth0 = users.data.find(
    (u) => u.user_id === secondaryUser.auth0Sub
  );

  if (!primaryUserAuth0 || !secondaryUserAuth0) {
    throw new Error("Primary or secondary user not found in Auth0.");
  }

  logger.info(
    `About to merge secondary user ${secondaryUser.sId} into primary user ${primaryUser.sId}.`
  );

  if (execute) {
    const [identityToMerge] = secondaryUserAuth0.identities;

    // Retrieve the connection id for the identity to merge.
    const connectionsResponse =
      await getAuth0ManagemementClient().connections.getAll({
        name: identityToMerge.connection,
      });

    const [connection] = connectionsResponse.data;
    if (!connection) {
      throw new Error(
        `Auth0 connection ${identityToMerge.connection} not found.`
      );
    }

    await auth0ManagemementClient.users.link(
      { id: primaryUserAuth0.user_id },
      {
        provider: identityToMerge.provider as PostIdentitiesRequestProviderEnum,
        connection_id: connection.id,
        user_id: identityToMerge.user_id,
      }
    );

    // Mark the primary user as having been linked.
    await auth0ManagemementClient.users.update(
      { id: primaryUserAuth0.user_id },
      {
        app_metadata: {
          account_linking_state: Date.now(),
        },
      }
    );

    logger.info(
      `Done merging secondary user ${secondaryUser.sId} into primary user ${primaryUser.sId}.`
    );
  }
}

makeScript(
  {
    primaryUserId: {
      type: "string",
      description: "The primary user ID to merge into",
    },
    secondaryUserId: {
      type: "string",
      description: "The secondary user ID to merge into the primary user",
    },
  },
  async ({ primaryUserId, secondaryUserId, execute }, logger) => {
    await mergeAccountsForUser(
      { primaryUserId, secondaryUserId },
      execute,
      logger
    );
  }
);
