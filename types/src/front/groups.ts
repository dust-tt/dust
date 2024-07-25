/**
 * system group:
 * Accessible by no-one other than our system API keys.
 * Has access to the system Vault which holds the connected data sources.
 *
 * global group:
 * Contains all users from the workspace.
 * Has access to the global Vault which holds all existing datasource created before vaults.
 *
 * regular group:
 * Contains specific users added by workspace admins.
 * Has access to the list of Vaults configured by workspace admins.
 */
export const GROUP_TYPES = ["regular", "global", "system"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export function isValidGroupType(value: unknown): value is GroupType {
  return GROUP_TYPES.includes(value as GroupType);
}
export function isSystemGroupType(value: GroupType): boolean {
  return value === "system";
}
export function isGlobalGroupType(value: GroupType): boolean {
  return value === "global";
}
