/**
 * system group:
 * Accessible by no-one other than our system API keys.
 * Has access to the system Space which holds the connected data sources.
 *
 * global group:
 * Contains all users from the workspace.
 * Has access to the global Space which holds all existing datasource created before spaces.
 *
 * regular group:
 * Contains specific users added by workspace admins.
 * Has access to the list of spaces configured by workspace admins.
 */

const DustGroupIdsHeader = "X-Dust-Group-Ids";
const DustRoleHeader = "X-Dust-Role";

// Front keeps a system key's default `admin` role when narrowing it to requested groups, unless a
// role is requested.
/**
 * @cc [owner:tdraier,label:security] requested-groups-carry-user-role
 * A request narrowed to `groupIds` MUST also send `X-Dust-Role: user`, so a caller without a Dust
 * user to exchange for (a whitelisted Slack bot, an email with no membership) never runs as a
 * workspace admin. Callers MUST NOT send `X-Dust-Group-Ids` through any other path.
 */
export function getHeadersFromRequestedGroupIds(
  groupIds: string[] | undefined
) {
  if (!groupIds) {
    return undefined;
  }

  return {
    [DustGroupIdsHeader]: groupIds.join(","),
    [DustRoleHeader]: "user",
  };
}

const DustUserEmailHeader = "x-api-user-email";

export function getHeaderFromUserEmail(email: string | undefined) {
  if (!email) {
    return undefined;
  }

  // The email may exceed Latin-1 (internationalized addresses); DustAPI
  // encodes extra header values on the wire (see @dust-tt/client baseHeaders).
  return {
    [DustUserEmailHeader]: email,
  };
}
