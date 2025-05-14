export type TagType = {
  sId: string;
  name: string;
  reserved: boolean;
};

export type TagTypeWithUsage = TagType & {
  usage: number;
};
