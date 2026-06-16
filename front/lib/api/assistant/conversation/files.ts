import type { FileSystemEntry } from "@app/lib/api/file_system/types";

export type GetConversationFilesResponseBody = {
  files: FileSystemEntry[];
};
