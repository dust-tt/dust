const SPACE_KINDS = ["regular", "global", "system", "public"] as const;
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
