import { difference } from "lodash";

import type { GongAPIUser } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongUserBlob } from "@connectors/resources/gong_resources";
import { GongUserResource } from "@connectors/resources/gong_resources";
import { concurrentExecutor } from "@connectors/types";

export function getUserBlobFromGongAPI(user: GongAPIUser): GongUserBlob | null {
  if (!user.emailAddress || !user.id) {
    return null;
  }
  return {
    email: user.emailAddress,
    gongId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

// Fetches users from our local database, and fetches missing users from the Gong API.
// Only users with an "internal" affiliation can be synced and stored in our database.
export async function getGongUsers(
  connector: ConnectorResource,
  { gongUserIds }: { gongUserIds: string[] }
) {
  const users = await GongUserResource.fetchByGongUserIds(connector, {
    gongUserIds,
  });

  // Find requested users that are missing from our local database.
  const missingUsers = difference(
    gongUserIds,
    users.map((user) => user.gongId)
  );

  if (missingUsers.length === 0) {
    return users;
  }

  const gongClient = await getGongClient(connector);

  await concurrentExecutor(
    missingUsers,
    async (gongUserId) => {
      // If the user does not exist yet, fetch it from the API and save it.
      const user = await gongClient.getUser({ userId: gongUserId });
      if (!user) {
        return null;
      }

      const userBlob = getUserBlobFromGongAPI(user);
      if (userBlob) {
        const newUser = await GongUserResource.makeNew(connector, userBlob);
        users.push(newUser);
      }
    },
    { concurrency: 10 }
  );

  return users;
}
