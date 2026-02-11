export const UNIQUE_SPACE_KINDS = [
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

export type UniqueSpaceKind = (typeof UNIQUE_SPACE_KINDS)[number];
export type SpaceType = {
  createdAt: number;
  description?: string;
  groupIds: string[];
  isRestricted: boolean;
  kind: SpaceKind;
  managementMode: "manual" | "group";
  name: string;
  sId: string;
  updatedAt: number;
};

export type ProjectType = Omit<SpaceType, "description"> & {
  description: string | null;
};

export function isUniqueSpaceKind(kind: SpaceKind): kind is UniqueSpaceKind {
  return UNIQUE_SPACE_KINDS.includes(kind as UniqueSpaceKind);
}

export const GROUP_SPACE_KINDS = [
  "member", // can access the space or project
  "project_editor", // can manage the project (not used for regular spaces)
  "project_viewer", // can see the project (not used for regular spaces)
] as const;
export type GroupSpaceKind = (typeof GROUP_SPACE_KINDS)[number];
