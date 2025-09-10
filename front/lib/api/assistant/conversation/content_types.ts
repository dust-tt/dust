// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import {
  CONTENT_NODE_MIME_TYPES,
  isDustMimeType,
  isIncludableInternalMimeType,
  isSupportedImageContentType,
} from "@dust-tt/client";

import type { SupportedContentFragmentType } from "@app/types";
import { isSupportedDelimitedTextContentType } from "@app/types";

export function isConversationIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isDustMimeType(contentType)) {
    return isIncludableInternalMimeType(contentType);
  }
  return true;
}

export function isQueryableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  // For now we only allow querying tabular files and multi-sheet spreadsheets
  // from connections.
  if (
    isSupportedDelimitedTextContentType(contentType) ||
    isMultiSheetSpreadsheetContentType(contentType)
  ) {
    return true;
  }
  return false;
}

export function isMultiSheetSpreadsheetContentType(
  contentType: SupportedContentFragmentType
): contentType is
  | typeof CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET
  | typeof CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET {
  return (
    contentType === CONTENT_NODE_MIME_TYPES.MICROSOFT.SPREADSHEET ||
    contentType === CONTENT_NODE_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET
  );
}

export function isSearchableContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  if (isSupportedDelimitedTextContentType(contentType)) {
    return false;
  }
  // For now we allow searching everything else.
  return true;
}
