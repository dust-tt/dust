import * as t from "io-ts";

// When viewing ContentNodes for a connector, we have 2 view types: tables and documents.
// "tables" view is only useful for Notion and Google Drive connectors in "read" permissions mode.
// It allows to pick tables in the Assistant Builder.
// "documents" view is useful for all connectors and all permissions modes (allows to pick documents in the Assistant Builder
// and view the permission tree).

// Define a codec for ContentNodesViewType using io-ts.
export const ContentNodesViewTypeCodec = t.union([
  t.literal("tables"),
  t.literal("documents"),
]);

export type ContentNodesViewType = t.TypeOf<typeof ContentNodesViewTypeCodec>;
