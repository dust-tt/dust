export type GoogleDriveObjectType = {
  capabilities: {
    canDownload: boolean;
  };
  createdAtMs: number;
  id: string;
  lastEditor?: {
    displayName: string;
  };
  mimeType: string;
  name: string;
  parent: string | null;
  size: number | null;
  trashed: boolean;
  updatedAtMs?: number;
  webViewLink?: string;
};
export type GoogleDriveFolderType = {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
};

export type GoogleDriveSelectedFolderType = GoogleDriveFolderType & {
  selected: boolean;
};

export const FILE_ATTRIBUTES_TO_FETCH = [
  "capabilities",
  "createdTime",
  "driveId",
  "id",
  "lastModifyingUser",
  "mimeType",
  "modifiedTime",
  "name",
  "parents",
  "size",
  "trashed",
  "webViewLink",
] as const;
