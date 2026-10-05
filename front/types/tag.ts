import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TAG_KINDS = ["standard", "protected"] as const;

export type TagKind = (typeof TAG_KINDS)[number];

export const TagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: z.enum(["standard", "protected"]),
});

export type TagType = z.infer<typeof TagSchema>;

export type TagTypeWithUsage = TagType & {
  usage: number;
};

export const MAX_TAG_LENGTH = 100;

// Bounds a suggested tag change, whose tags are resolved and created in batches.
export const MAX_TAGS_PER_CHANGE = 20;
