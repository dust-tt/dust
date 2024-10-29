const SPACE_KINDS = ["regular", "global", "system", "public"] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export type SpaceType = {
  name: string;
  sId: string;
  kind: SpaceKind;
  groupIds: string[];
  isRestricted: boolean;
};
