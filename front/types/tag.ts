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

export const tagSchema = z.object({
  tag: z
    .string()
    .min(1, "Tag name is required")
    .max(MAX_TAG_LENGTH, `Tag name cannot exceed ${MAX_TAG_LENGTH} characters`),
});

export type TagForm = z.infer<typeof tagSchema>;
