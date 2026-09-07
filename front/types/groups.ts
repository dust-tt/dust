import { z } from "zod";

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
 * "regular" groups are groups for which users are selected one by one (as opposed
 * to provisioned groups whose membership is synced from an external identity
 * provider). They come in two flavors depending on how the group was created:
 *
 * regular_auto group: Created implicitly by Dust (e.g. agent editors, space
 * members).
 *
 * regular_manual group: Created manually by the user via the UI. They can be used
 * to grant specific permissions to users.
 *
 * agent_editors group: Group specific to represent agent editors, tied to an
 *  agent. Has special permissions: not restricted only to admins. Users can
 *  create, and members of the group can update it.
 *
 *  provisioned group: Contains all users from a provisioned group.
 */
export const GROUP_KINDS = [
  "regular_auto",
  "regular_manual",
  "global",
  "system",
  "agent_editors",
  "provisioned",
] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

// Group kinds that can carry a per-group usage spend limit and be surfaced in
// the Usage > Groups admin table. Only "provisioned" (SSO/SCIM directory)
// and regular_manual groups.
export const CAP_ELIGIBLE_GROUP_KINDS = [
  "provisioned",
  "regular_manual",
] as const;

export function isCapEligibleGroupKind(kind: GroupKind): boolean {
  return CAP_ELIGIBLE_GROUP_KINDS.some((k) => k === kind);
}

// Group kinds that represent user-managed membership collections and are
// surfaced in workspace admin UIs (Groups tab, governance). Excludes internal
// system/permission groups.
export const MANAGEABLE_GROUP_KINDS = [
  "provisioned",
  "regular_manual",
] as const;

export function isManageableGroupKind(kind: GroupKind): boolean {
  return MANAGEABLE_GROUP_KINDS.some((k) => k === kind);
}

// Group kinds that any workspace member may see directly (e.g. in the workspace
// Groups listing or when referencing a group by id). Internal kinds
// (`regular_auto`, `system`, `agent_editors`) are never surfaced this way: they
// are implementation details of spaces, permissions, and agent editors.
export const USER_VISIBLE_GROUP_KINDS = [
  ...MANAGEABLE_GROUP_KINDS,
  "global",
] as const;

export function isUserVisibleGroupKind(
  kind: GroupKind
): kind is UserVisibleGroupKind {
  return USER_VISIBLE_GROUP_KINDS.some((k) => k === kind);
}

export type UserVisibleGroupKind = (typeof USER_VISIBLE_GROUP_KINDS)[number];

export function isGroupKind(value: unknown): value is GroupKind {
  return GROUP_KINDS.includes(value as GroupKind);
}
export function isSystemGroupKind(value: GroupKind): boolean {
  return value === "system";
}
export function isGlobalGroupKind(value: GroupKind): boolean {
  return value === "global";
}

export function isRegularManualGroupKind(value: GroupKind): boolean {
  return value === "regular_manual";
}

export function isAgentEditorGroupKind(value: GroupKind): boolean {
  return value === "agent_editors";
}

export type GroupType = {
  id: ModelId;
  name: string;
  sId: string;
  kind: GroupKind;
  workspaceId: ModelId;
  memberCount: number;
  // Per-group usage spend limit (excluding seat allowance), applied per member.
  // null means the group carries no cap (falls back to the workspace default).
  poolCapAwuCredits: number | null;
  // Member sIds, only populated when explicitly requested
  memberIds?: string[];
};

export const GroupKindCodec = z.enum([
  "global",
  "regular_auto",
  "regular_manual",
  "agent_editors",
  "system",
  "provisioned",
]);

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
export const PROJECT_GROUP_PREFIX = "Group for Pod";
export const PROJECT_EDITOR_GROUP_PREFIX = "Editors for Pod";
export const GLOBAL_SPACE_NAME = "Company Data";
