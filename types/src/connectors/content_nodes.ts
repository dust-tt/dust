import { ContentNode } from "../front/lib/connectors_api";
import {
  getGoogleSheetTableIdFromContentNodeInternalId,
  isGoogleSheetContentNodeInternalId,
} from "./google_drive";
import { getMicrosoftSheetContentNodeInternalIdFromTableId } from "./microsoft";
import { getNotionDatabaseTableIdFromContentNodeInternalId } from "./notion";

// When viewing ContentNodes for a connector, we have 2 view types: tables and documents.
// "tables" view is only useful for Notion and Google Drive connectors in "read" permissions mode.
// It allows to pick tables in the Assistant Builder.
// "documents" view is useful for all connectors and all permissions modes (allows to pick documents in the Assistant Builder
// and view the permission tree).

export type ContentNodesViewType = "tables" | "documents";

export function getTableIdForContentNode(contentNode: ContentNode): string {
  if (contentNode.type !== "database") {
    throw new Error(`ContentNode type ${contentNode.type} is not supported`);
  }
  switch (contentNode.provider) {
    case "notion":
      return getNotionDatabaseTableIdFromContentNodeInternalId(
        contentNode.internalId
      );
    case "google_drive":
      if (!isGoogleSheetContentNodeInternalId(contentNode.internalId)) {
        throw new Error(
          `Googgle Drive ContentNode internalId ${contentNode.internalId} is not a Google Sheet internal ID`
        );
      }
      return getGoogleSheetTableIdFromContentNodeInternalId(
        contentNode.internalId
      );
    case "microsoft":
      return getMicrosoftSheetContentNodeInternalIdFromTableId(
        contentNode.internalId
      );
    default:
      throw new Error(`Provider ${contentNode.provider} is not supported`);
  }
}
