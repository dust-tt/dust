export type GoogleDriveFileType = {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs?: number;
  webViewLink?: string;
  mimeType: string;
  lastEditor?: {
    displayName: string;
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
