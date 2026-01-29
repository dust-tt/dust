import * as t from "io-ts";

import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";
import { isRoleType } from "./user";

/**
 * system group: Accessible by no-one other than our system API keys. Has access
 * to the system Space which holds the connected data sources.
 *
 * global group: Contains all users from the workspace. Has access to the global
 * Space which holds all existing datasource created before spaces.
 *
 * regular group: Contains specific users added by workspace admins. Has access
 * to the list of spaces configured by workspace admins.
 *
 * agent_editors group: Group specific to represent agent editors, tied to an
 *  agent. Has special permissions: not restricted only to admins. Users can
 *  create, and members of the group can update it.
 *
 * skill_editors group: Group specific to represent skill editors, tied to a
 *  skill. Has special permissions: not restricted only to admins. Users can
 *  create, and members of the group can update it.
 *
 *  provisioned group: Contains all users from a provisioned group.
 */
export const GROUP_KINDS = [
  "regular",
  // space_editors is used to know if a member of a manual group can edit the group
  "space_editors",
  "global",
  "system",
  "agent_editors",
  "skill_editors",
  "provisioned",
] as const;
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

export function isAgentEditorGroupKind(value: GroupKind): boolean {
  return value === "agent_editors";
}

export function isSkillEditorGroupKind(value: GroupKind): boolean {
  return value === "skill_editors";
}

export type GroupType = {
  id: ModelId;
  name: string;
  sId: string;
  kind: GroupKind;
  workspaceId: ModelId;
  memberCount: number;
};

export const GroupKindCodec = t.keyof({
  global: null,
  regular: null,
  space_editors: null,
  agent_editors: null,
  skill_editors: null,
  system: null,
  provisioned: null,
});

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

const DustRoleHeader = "X-Dust-Role";

export function getRoleFromHeaders(
  headers: Record<string, string | string[] | undefined>
): RoleType | undefined {
  let role = headers[DustRoleHeader.toLowerCase()];
  if (typeof role === "string") {
    role = role.trim();
    if (role.length > 0 && isRoleType(role)) {
      return role;
    }
  }
  return undefined;
}

/**
 * Pass the user's role to the API via headers for internal system-key calls (e.g., runApp).
 */
export function getHeaderFromRole(role: RoleType | undefined) {
  if (!role) {
    return undefined;
  }
  return {
    [DustRoleHeader]: role,
  };
}

export const AGENT_GROUP_PREFIX = "Group for Agent";
export const SKILL_GROUP_PREFIX = "Group for Skill";
export const SPACE_GROUP_PREFIX = "Group for space";
export const PROJECT_GROUP_PREFIX = "Group for project";
export const PROJECT_EDITOR_GROUP_PREFIX = "Editors for project";
export const GLOBAL_SPACE_NAME = "Company Data";
