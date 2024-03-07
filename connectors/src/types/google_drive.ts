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
  size: number;
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
  "id",
  "name",
  "parents",
  "mimeType",
  "createdTime",
  "lastModifyingUser",
  "modifiedTime",
  "trashed",
  "webViewLink",
  "capabilities",
  "driveId",
] as const;
