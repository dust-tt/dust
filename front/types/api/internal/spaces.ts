import * as t from "io-ts";
import { z } from "zod";

export const ContentSchema = t.type({
  dataSourceId: t.string,
  parentsIn: t.array(t.string),
});

export const PatchSpaceRequestBodySchema = t.type({
  name: t.union([t.string, t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export const PostDataSourceViewSchema = ContentSchema;

export const PostNotionSyncPayloadSchema = t.type({
  urls: t.array(t.string),
  method: t.union([t.literal("sync"), t.literal("delete")]),
});

export const GetPostNotionSyncResponseBodySchema = t.type({
  syncResults: t.array(
    t.intersection([
      t.type({
        url: t.string,
        method: t.union([t.literal("sync"), t.literal("delete")]),
        timestamp: t.number,
        success: t.boolean,
      }),
      t.partial({
        error_message: t.string,
      }),
    ])
  ),
});

export type GetPostNotionSyncResponseBody = t.TypeOf<
  typeof GetPostNotionSyncResponseBodySchema
>;

export const PatchProjectMetadataBodySchema = z.object({
  description: z.string().optional(),
  urls: z
    .array(
      z.object({
        name: z
          .string()
          .nonempty("URL name is required")
          .max(255, "URL name should be less than 255 characters"),
        url: z
          .string()
          .url("Please enter a valid URL")
          .nonempty("URL is required"),
      })
    )
    .optional(),
});

export type PatchProjectMetadataBodyType = z.infer<
  typeof PatchProjectMetadataBodySchema
>;
