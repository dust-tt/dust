export const UNIQUE_SPACE_KINDS = [
  "global",
  "system",
  "conversations",
] as const;

const SPACE_KINDS = [...UNIQUE_SPACE_KINDS, "public", "regular"] as const;

export type SpaceKind = (typeof SPACE_KINDS)[number];

export type SpaceType = {
  createdAt: number;
  groupIds: string[];
  isRestricted: boolean;
  kind: SpaceKind;
  name: string;
  sId: string;
  updatedAt: number;
};
