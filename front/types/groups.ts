import type { ModelId } from "./shared/model_id";

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
  return group.name.replace("Group for Space ", "");
}

export type GroupType = {
  id: ModelId;
  name: string;
  sId: string;
  kind: GroupKind;
  workspaceId: ModelId;
};

const DustGroupIdsHeader = "X-Dust-Group-Ids";

export function getGroupIdsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string[] | undefined {
  const groupIds = headers[DustGroupIdsHeader.toLowerCase()];
  if (typeof groupIds === "string" && groupIds.trim().length > 0) {
    return groupIds.split(",").map((id) => id.trim());
  } else {
    return undefined;
  }
}

export function getHeaderFromGroupIds(groupIds: string[] | undefined) {
  if (!groupIds) {
    return undefined;
  }

  return {
    [DustGroupIdsHeader]: groupIds.join(","),
  };
}
