// When viewing ContentNodes for a connector, we have 2 view types: tables and documents.
// "tables" view is only useful for Notion and Google Drive connectors in "read" permissions mode.
// It allows to pick tables in the Assistant Builder.
// "documents" view is useful for all connectors and all permissions modes (allows to pick documents in the Assistant Builder
// and view the permission tree).

export type ContentNodesViewType = "tables" | "documents";
