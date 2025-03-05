import type { GongAPIUser } from "@connectors/connectors/gong/lib/gong_api";
import { getGongClient } from "@connectors/connectors/gong/lib/utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongUserBlob } from "@connectors/resources/gong_resources";
import { GongUserResource } from "@connectors/resources/gong_resources";

export function getUserBlobFromGongAPI(user: GongAPIUser): GongUserBlob {
  return {
    email: user.emailAddress,
    gongId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export async function getGongUser(
  connector: ConnectorResource,
  { gongUserId }: { gongUserId: string }
): Promise<GongUserResource | null> {
  const user = await GongUserResource.fetchByGongUserId(connector, {
    gongUserId,
  });

  // If the user does not exist yet, fetch it from the API and save it.
  if (!user) {
    const gongClient = await getGongClient(connector);

    const user = await gongClient.getUser({ userId: gongUserId });
    if (!user) {
      return null;
    }

    return GongUserResource.makeNew(connector, getUserBlobFromGongAPI(user));
  }

  return user;
}
