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
export const GROUP_KINDS = ["regular", "global", "system"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export function isGroupKind(value: unknown): value is GroupKind {
  return GROUP_KINDS.includes(value as GroupKind);
}
export function isSystemGroupKind(value: GroupKind): boolean {
  return value === "system";
}
export function isGlobalGroupKind(value: GroupKind): boolean {
  return value === "global";
}

export function prettifyGroupName(group: GroupType) {
  if (group.kind === "global") {
    return "Company Data";
  }
  return group.name.replace("Group for vault ", "");
}

export type GroupType = {
  id: ModelId;
  name: string;
  sId: string;
  kind: GroupKind;
  workspaceId: ModelId;
};
