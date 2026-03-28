import type {
  DetectedSkill,
  DetectedSkillAttachment,
} from "@app/lib/api/skills/detection/types";

export type ZipEntry = {
  path: string;
  originalEntryName: string;
  sizeBytes: number;
  isDirectory: boolean;
};

/**
 * Zip-specific attachment: extends the base with `originalEntryName`, the
 * raw zip path (before prefix stripping) needed to extract the file content.
 */
export type ZipDetectedSkillAttachment = DetectedSkillAttachment & {
  originalEntryName: string;
};

export type ZipDetectedSkill = DetectedSkill & {
  attachments: ZipDetectedSkillAttachment[];
};
