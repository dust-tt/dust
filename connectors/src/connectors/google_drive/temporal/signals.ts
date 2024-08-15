import { defineSignal } from "@temporalio/workflow";

export interface FolderUpdatesSignal {
  action: "added" | "removed";
  folderId: string;
}

export const folderUpdatesSignal =
  defineSignal<[FolderUpdatesSignal[]]>("folderUpdateSignal");
