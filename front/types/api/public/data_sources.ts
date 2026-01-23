import * as t from "io-ts";

import type { CoreAPIDataSourceDocumentSection } from "../../core/data_source";

export const UpsertContextSchema = t.type({
  sync_type: t.union([
    t.literal("batch"),
    t.literal("incremental"),
    t.undefined,
  ]),
});

export type UpsertContext = t.TypeOf<typeof UpsertContextSchema>;

export const FrontDataSourceDocumentSection: t.RecursiveType<
  t.Type<CoreAPIDataSourceDocumentSection>,
  CoreAPIDataSourceDocumentSection
> = t.recursion("Section", () =>
  t.type({
    prefix: t.union([t.string, t.null]),
    content: t.union([t.string, t.null]),
    sections: t.array(FrontDataSourceDocumentSection),
  })
);

export type FrontDataSourceDocumentSectionType = t.TypeOf<
  typeof FrontDataSourceDocumentSection
>;

export const PostDataSourceDocumentRequestBodySchema = t.type({
  timestamp: t.union([t.Int, t.undefined, t.null]),
  tags: t.union([t.array(t.string), t.undefined, t.null]),
  parent_id: t.union([t.string, t.undefined, t.null]),
  parents: t.union([t.array(t.string), t.undefined, t.null]),
  source_url: t.union([t.string, t.undefined, t.null]),
  upsert_context: t.union([UpsertContextSchema, t.undefined, t.null]),
  text: t.union([t.string, t.undefined, t.null]),
  section: t.union([FrontDataSourceDocumentSection, t.undefined, t.null]),
  light_document_output: t.union([t.boolean, t.undefined]),
  async: t.union([t.boolean, t.undefined, t.null]),
  title: t.string,
  mime_type: t.string,
  // Optional document_id for LLM-friendly node IDs (e.g., slugified).
  // Falls back to title if not provided.
  document_id: t.union([t.string, t.undefined]),
});

export type PostDataSourceDocumentRequestBody = t.TypeOf<
  typeof PostDataSourceDocumentRequestBodySchema
>;

// Post and Patch require the same request body
export type PatchDataSourceDocumentRequestBody = t.TypeOf<
  typeof PostDataSourceDocumentRequestBodySchema
>;
export const PatchDataSourceTableRequestBodySchema = t.intersection([
  t.type({
    name: t.string,
    description: t.string,
    timestamp: t.union([t.number, t.undefined, t.null]),
    tags: t.union([t.array(t.string), t.undefined, t.null]),
    parentId: t.union([t.string, t.undefined, t.null]),
    parents: t.union([t.array(t.string), t.undefined, t.null]),
    async: t.union([t.boolean, t.undefined]),
    title: t.string,
    mimeType: t.string,
    sourceUrl: t.union([t.string, t.undefined, t.null]),
  }),
  t.union([
    // When a file is uploaded, we need to truncate the table and add the file id.
    t.type({
      truncate: t.literal(true),
      fileId: t.string,
    }),
    // Otherwise, the fileId must not be provided and truncate must be false, we'll just update the metadata.
    t.type({
      truncate: t.literal(false),
      fileId: t.undefined,
    }),
  ]),
]);

export type PatchDataSourceTableRequestBody = t.TypeOf<
  typeof PatchDataSourceTableRequestBodySchema
>;
