export type GoogleDriveObjectType = {
  id: string;
  name: string;
  parent: string | null;
  createdAtMs: number;
  updatedAtMs?: number;
  webViewLink?: string;
  mimeType: string;
  trashed: boolean;
  lastEditor?: {
    displayName: string;
  };
  capabilities: {
    canDownload: boolean;
  };
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
