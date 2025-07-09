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

export function getHeaderFromGroupIds(groupIds: string[] | undefined) {
  if (!groupIds) {
    return undefined;
  }

  return {
    [DustGroupIdsHeader]: groupIds.join(","),
  };
}

const DustUserEmailHeader = "x-api-user-email";

export function getHeaderFromUserEmail(email: string | undefined) {
  if (!email) {
    return undefined;
  }

  return {
    [DustUserEmailHeader]: email,
  };
}
