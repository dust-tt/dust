import type { TagType } from "@app/types/tag";

export type GetTagsResponseBody = {
  tags: TagType[];
};

export type CreateTagResponseBody = {
  tag: TagType;
};
