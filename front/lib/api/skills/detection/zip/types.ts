export type ZipSkillDetectionError = {
  type: "invalid_zip";
  message: string;
};

export interface ZipEntry {
  /** Normalized path (no trailing slash). */
  path: string;
  /** Original entry name as stored in the ZIP (may include trailing slash). */
  originalEntryName: string;
  sizeBytes: number;
  isDirectory: boolean;
}
