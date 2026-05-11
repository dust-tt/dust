import type { GongAPIUser } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongUserBlob } from "@connectors/resources/gong_resources";
import { GongUserResource } from "@connectors/resources/gong_resources";
import { removeNulls } from "@connectors/types/shared/utils/general";

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
  const existingUserIds = new Set(users.map((user) => user.gongId));
  const missingUserIds = gongUserIds.filter(
    (gongUserId) => !existingUserIds.has(gongUserId)
  );

  if (missingUserIds.length === 0) {
    return users;
  }

  const gongClient = await getGongClient(connector);

  const gongApiUsers: GongAPIUser[] = [];
  let pageCursor: string | null = null;

  do {
    const { users: fetchedUsers, nextPageCursor } =
      await gongClient.getUsersByIds({
        userIds: missingUserIds,
        pageCursor,
      });

    gongApiUsers.push(...fetchedUsers);
    pageCursor = nextPageCursor;
  } while (pageCursor);

  const userBlobs = removeNulls(gongApiUsers.map(getUserBlobFromGongAPI));
  if (userBlobs.length === 0) {
    return users;
  }

  const newUsers = await GongUserResource.batchCreate(connector, userBlobs);

  return [...users, ...newUsers];
}
