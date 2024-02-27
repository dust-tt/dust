import * as t from "io-ts";

import { CoreAPIDataSourceDocumentSection } from "../../../core/data_source";

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

export const PostDataSourceDocumentRequestBodySchema = t.type({
  timestamp: t.union([t.number, t.undefined, t.null]),
  tags: t.union([t.array(t.string), t.undefined, t.null]),
  parents: t.union([t.array(t.string), t.undefined, t.null]),
  source_url: t.union([t.string, t.undefined, t.null]),
  upsert_context: t.union([UpsertContextSchema, t.undefined, t.null]),
  text: t.union([t.string, t.undefined, t.null]),
  section: t.union([FrontDataSourceDocumentSection, t.undefined, t.null]),
  light_document_output: t.union([t.boolean, t.undefined]),
  async: t.union([t.boolean, t.undefined, t.null]),
});

export type PostDataSourceDocumentRequestBody = t.TypeOf<
  typeof PostDataSourceDocumentRequestBodySchema
>;
