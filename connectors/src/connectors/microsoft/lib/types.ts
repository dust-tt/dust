import type { DriveItem as MicrosoftDriveItem } from "@microsoft/microsoft-graph-types";

export type DriveItem = Pick<
  MicrosoftDriveItem,
  | "id"
  | "name"
  | "parentReference"
  | "webUrl"
  | "file"
  | "folder"
  | "root"
  | "deleted"
  | "createdBy"
  | "lastModifiedBy"
  | "createdDateTime"
  | "lastModifiedDateTime"
  | "size"
  | "sharepointIds"
  | "listItem" // This must be expanded to get the fields
> & { "@microsoft.graph.downloadUrl": string | undefined };

// This must match the type above and be used when using the graph API
// Note: for some reason, $select do not work for @microsoft.graph.downloadUrl but select does.
export const DRIVE_ITEM_EXPANDS_AND_SELECTS =
  "$select=id,name,parentReference,webUrl,file,folder,root,deleted,createdBy,lastModifiedBy,createdDateTime,lastModifiedDateTime,size,sharepointIds&$expand=listItem($expand=fields)&select=@microsoft.graph.downloadUrl";

// Extends the base query to also fetch the sensitivity label ID (_IpLabelId).
// Requires the SensitivityLabels.Read.All OAuth scope — only use when labels are configured.
export const DRIVE_ITEM_EXPANDS_AND_SELECTS_WITH_LABELS =
  "$select=id,name,parentReference,webUrl,file,folder,root,deleted,createdBy,lastModifiedBy,createdDateTime,lastModifiedDateTime,size,sharepointIds&$expand=listItem($expand=fields($select=_IpLabelId))&select=@microsoft.graph.downloadUrl";

// Lean projection used for delta pagination. Unlike the projections above it omits
// the `$expand=listItem($expand=fields)` expansion and the `@microsoft.graph.downloadUrl`
// select. Those two are the memory-heavy parts of a `DriveItem`: expanded SharePoint
// custom-column payloads and a per-item download URL. `getFullDeltaResults` keeps every
// latest `DriveItem` in an in-memory map until pagination completes, so carrying that
// metadata for every folder, root marker and deleted entry (none of which need it)
// inflates the worker's footprint and can OOM the pod on large drives.
// `syncOneFile` already re-hydrates the download URL and list-item fields per file on
// demand (see connectors/src/connectors/microsoft/temporal/file.ts), so files that are
// actually synced still get the full metadata.
export const DRIVE_ITEM_DELTA_SELECTS =
  "$select=id,name,parentReference,webUrl,file,folder,root,deleted,createdBy,lastModifiedBy,createdDateTime,lastModifiedDateTime,size,sharepointIds";

// Value stored in `microsoft_nodes.skipReason` when a file is excluded by sensitivity label allowlist.
export const MICROSOFT_SKIP_REASON_SENSITIVITY_LABEL_NOT_ALLOWED =
  "sensitivity_label_not_allowed" as const;

export const MICROSOFT_NODE_TYPES = [
  "sites-root",
  "site",
  "drive",
  "folder",
  "file",
  "page",
  "message",
  "worksheet",
] as const;
export type MicrosoftNodeType = (typeof MICROSOFT_NODE_TYPES)[number];

export function isValidNodeType(
  nodeType: string
): nodeType is MicrosoftNodeType {
  return MICROSOFT_NODE_TYPES.includes(nodeType as MicrosoftNodeType);
}

/* A specific situation for the Microsoft connector leads us to not use the
 * externally provided id (although it exists and is unique), but to compute our
 * own `internal id`. This is because the Microsoft API does not allow to query a document or
 * list its children using its id alone. We compute an internal id that contains all
 * information. More details
 * [here](https://app.notion.com/p/dust-tt/Design-Doc-Microsoft-ids-parents-c27726652aae45abafaac587b971a41d?pvs=4)
 */
export type MicrosoftNode = {
  nodeType: MicrosoftNodeType;
  name: string | null;
  internalId: string;
  parentInternalId: string | null;
  mimeType: string | null;
  webUrl: string | null;
};
