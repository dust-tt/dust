const UNIQUE_SPACE_KINDS = ["global", "system", "conversations"] as const;

export const SPACE_KINDS = [
  ...UNIQUE_SPACE_KINDS,
  "public",
  "regular",
] as const;

export type SpaceKind = (typeof SPACE_KINDS)[number];

export type UniqueSpaceKind = (typeof UNIQUE_SPACE_KINDS)[number];
export type SpaceType = {
  createdAt: number;
  groupIds: string[];
  isRestricted: boolean;
  kind: SpaceKind;
  managementMode: "manual" | "group";
  name: string;
  sId: string;
  updatedAt: number;
};

export function isUniqueSpaceKind(kind: SpaceKind): kind is UniqueSpaceKind {
  return UNIQUE_SPACE_KINDS.includes(kind as UniqueSpaceKind);
}
