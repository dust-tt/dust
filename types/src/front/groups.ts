import { ModelId } from "../shared/model_id";

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
export const SUPPORTED_GROUP_TYPES = ["regular", "global", "system"] as const;
export type SupportedGroupType = (typeof SUPPORTED_GROUP_TYPES)[number];

export function isSupportedGroupType(
  value: unknown
): value is SupportedGroupType {
  return SUPPORTED_GROUP_TYPES.includes(value as SupportedGroupType);
}
export function isSystemGroupType(value: SupportedGroupType): boolean {
  return value === "system";
}
export function isGlobalGroupType(value: SupportedGroupType): boolean {
  return value === "global";
}

export type GroupType = {
  id: ModelId;
  name: string;
  sId: string;
  type: SupportedGroupType;
  workspaceId: ModelId;
};
