export type ZipSkillDetectionError = {
  type: "invalid_zip";
  message: string;
};

export interface ZipEntry {
  path: string;
  originalEntryName: string;
  sizeBytes: number;
  isDirectory: boolean;
}
