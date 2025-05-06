export type TagType = {
  sId: string;
  name: string;
};

export type TagTypeWithUsage = TagType & {
  usage: number;
};
