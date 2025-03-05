import type { GongAPIUser } from "@connectors/connectors/gong/lib/gong_api";
import type { GongUserBlob } from "@connectors/resources/gong_resources";

export function getUserBlobFromGongAPI(user: GongAPIUser): GongUserBlob {
  return {
    email: user.emailAddress,
    gongId: user.id,
    firstName: user.firstName,
    emailAliases: user.emailAliases,
    lastName: user.lastName,
  };
}
