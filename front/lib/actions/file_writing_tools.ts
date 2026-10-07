import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  DOCUMENTS_SERVER_NAME,
  isDocumentsWritingTool,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  FILES_SERVER_NAME,
  isFilesWritingTool,
} from "@app/lib/api/actions/servers/files/metadata";

/**
 * Whether the internal tool changes the files named by its `path`, `source` or `dest` input, so
 * a client showing them must refetch.
 */
export function isFileWritingInternalTool(
  internalMCPServerName: InternalMCPServerNameType | null,
  toolName: string
): boolean {
  switch (internalMCPServerName) {
    case FILES_SERVER_NAME:
      return isFilesWritingTool(toolName);
    case DOCUMENTS_SERVER_NAME:
      return isDocumentsWritingTool(toolName);
    default:
      return false;
  }
}
