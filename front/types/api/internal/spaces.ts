import { z } from "zod";

export const ContentSchema = z.object({
  dataSourceId: z.string(),
  parentsIn: z.array(z.string()),
});

export const PatchSpaceRequestBodySchema = z.object({
  name: z.string().optional(),
  content: z.array(ContentSchema).optional(),
});

export const PostDataSourceViewSchema = ContentSchema;

export const PostNotionSyncPayloadSchema = z.object({
  urls: z.array(z.string()),
  method: z.enum(["sync", "delete"]),
});

export const GetPostNotionSyncResponseBodySchema = z.object({
  syncResults: z.array(
    z.object({
      url: z.string(),
      method: z.enum(["sync", "delete"]),
      timestamp: z.number(),
      success: z.boolean(),
      error_message: z.string().optional(),
    })
  ),
});

export type GetPostNotionSyncResponseBody = z.infer<
  typeof GetPostNotionSyncResponseBodySchema
>;

export const PatchProjectMetadataBodySchema = z.object({
  description: z.string().optional(),
  archive: z.boolean().optional(),
  todoGenerationEnabled: z.boolean().optional(),
  initialTodoAnalysisLookback: z.enum(["now", "last_24h", "max"]).optional(),
  pinnedFramePath: z.string().nullable().optional(),
});

export type PatchProjectMetadataBodyType = z.infer<
  typeof PatchProjectMetadataBodySchema
>;
