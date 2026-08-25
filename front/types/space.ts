import type { PodFrameTab } from "@app/types/pod_frame_tab";

const UNIQUE_SPACE_KINDS = [
  "global", // Also known as "company data", by definition, this space is shared by all users in the workspace.
  "system", // Used for admins to configure the workspace datasources and other system-wide settings.
  "conversations", // Space to hold conversations uploaded and generated files (legacy).
] as const;

export const SPACE_KINDS = [
  ...UNIQUE_SPACE_KINDS,
  "regular", // Can be open or restricted based on the groups assigned to the space (if the global group is assigned, it's open, otherwise it's restricted).
  "project", // Can be open or restricted based on the groups assigned to the space (if the global group is assigned, it's open, otherwise it's restricted).
] as const;

export type SpaceKind = (typeof SPACE_KINDS)[number];

type UniqueSpaceKind = (typeof UNIQUE_SPACE_KINDS)[number];
/**
 * @swaggerschema PrivateSpace (swagger_private_schemas.ts)
 */
export type SpaceType = {
  createdAt: number;
  isRestricted: boolean;
  kind: SpaceKind;
  managementMode: "manual" | "group";
  name: string;
  sId: string;
  updatedAt: number;
};

/**
 * A space serialized together with the sIds of the groups holding a grant on it. `groupIds` is
 * loaded from `group_permissions` on demand by the endpoints that expose it (the public API for
 * backward compatibility, and the space-management UI) rather than carried on every `SpaceType`.
 *
 * @swaggerschema Space (swagger_schemas.ts)
 */
export type SpaceTypeWithGroupIds = SpaceType & {
  groupIds: string[];
};

/**
 * @swaggerschema PrivateProject (swagger_private_schemas.ts)
 */
export type PodType = SpaceTypeWithGroupIds & {
  description: string | null;
  isMember: boolean;
  isEditor: boolean;
  archivedAt: number | null;
  pinnedFramePath?: string | null;
  frameTabs?: PodFrameTab[];
  tabsOrder?: string[];
  isAdminControlled?: boolean;
};

export type PodListItemType = PodType & {
  isStarred: boolean;
};

export function isProjectType(space: SpaceType | PodType): space is PodType {
  return space.kind === "project";
}

export function isUniqueSpaceKind(kind: SpaceKind): kind is UniqueSpaceKind {
  return UNIQUE_SPACE_KINDS.includes(kind as UniqueSpaceKind);
}

export const GROUP_SPACE_KINDS = [
  "member", // can access the space or project
  "project_editor", // can manage the project (not used for regular spaces)
  "project_viewer", // can see the project (not used for regular spaces)
] as const;
export type GroupSpaceKind = (typeof GROUP_SPACE_KINDS)[number];
