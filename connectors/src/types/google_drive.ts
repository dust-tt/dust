export type GoogleDriveFileType = {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs?: number;
  webViewLink?: string;
  lastEditor?: {
    displayName: string;
  };
};
