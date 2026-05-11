import { z } from "zod";

import type { CoreAPIDataSourceDocumentSection } from "../../core/data_source";

export const UpsertContextSchema = z.object({
  sync_type: z.enum(["batch", "incremental"]).optional(),
});

export type UpsertContext = z.infer<typeof UpsertContextSchema>;

export const FrontDataSourceDocumentSection: z.ZodType<CoreAPIDataSourceDocumentSection> =
  z.lazy(() =>
    z.object({
      prefix: z.string().nullable(),
      content: z.string().nullable(),
      sections: z.array(FrontDataSourceDocumentSection),
    })
  );

export type FrontDataSourceDocumentSectionType = z.infer<
  typeof FrontDataSourceDocumentSection
>;

export const PostDataSourceDocumentRequestBodySchema = z.object({
  timestamp: z.number().int().nullish(),
  tags: z.array(z.string()).nullish(),
  parent_id: z.string().nullish(),
  parents: z.array(z.string()).nullish(),
  source_url: z.string().nullish(),
  upsert_context: UpsertContextSchema.nullish(),
  text: z.string().nullish(),
  section: FrontDataSourceDocumentSection.nullish(),
  light_document_output: z.boolean().optional(),
  async: z.boolean().nullish(),
  title: z.string(),
  mime_type: z.string(),
  // Optional document_id for LLM-friendly node IDs (e.g., slugified).
  // Falls back to title if not provided.
  document_id: z.string().optional(),
});

export type PostDataSourceDocumentRequestBody = z.infer<
  typeof PostDataSourceDocumentRequestBodySchema
>;

// Post and Patch require the same request body
export type PatchDataSourceDocumentRequestBody = z.infer<
  typeof PostDataSourceDocumentRequestBodySchema
>;
export const PatchDataSourceTableRequestBodySchema = z.intersection(
  z.object({
    name: z.string(),
    description: z.string(),
    timestamp: z.number().nullish(),
    tags: z.array(z.string()).nullish(),
    parentId: z.string().nullish(),
    parents: z.array(z.string()).nullish(),
    async: z.boolean().optional(),
    title: z.string(),
    mimeType: z.string(),
    sourceUrl: z.string().nullish(),
  }),
  z.union([
    // When a file is uploaded, we need to truncate the table and add the file id.
    z.object({
      truncate: z.literal(true),
      fileId: z.string(),
    }),
    // Otherwise, the fileId must not be provided and truncate must be false, we'll just update the metadata.
    z.object({
      truncate: z.literal(false),
      fileId: z.undefined(),
    }),
  ])
);

export type PatchDataSourceTableRequestBody = z.infer<
  typeof PatchDataSourceTableRequestBodySchema
>;
