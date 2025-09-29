import { z } from "zod";

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

const MAX_TAG_LENGTH = 100;

const tagSchema = z.object({
  tag: z
    .string()
    .min(1, "Tag name is required")
    .max(MAX_TAG_LENGTH, `Tag name cannot exceed ${MAX_TAG_LENGTH} characters`),
});

export type TagForm = z.infer<typeof tagSchema>;
