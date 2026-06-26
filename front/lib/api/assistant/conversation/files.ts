import type { FileSystemEntry } from "@app/types/api/file_system/types";

export type GetConversationFilesResponseBody = {
  files: FileSystemEntry[];
};
