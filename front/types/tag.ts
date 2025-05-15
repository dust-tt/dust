const TAG_KINDS = ["standard", "protected"] as const;

export type TagKind = (typeof TAG_KINDS)[number];

export type TagType = {
  sId: string;
  name: string;
  kind: TagKind;
};

export type TagTypeWithUsage = TagType & {
  usage: number;
};
