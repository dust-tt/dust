// Re-export shared types from github_detection.
export type {
  DetectedSkill,
  DetectedSkillAttachment,
} from "@app/lib/api/skills/github_detection/types";

export type ZipSkillDetectionError =
  | { type: "invalid_zip"; message: string }
  | { type: "no_skills_found"; message: string };

export interface ZipEntry {
  /** Normalized path (no trailing slash). */
  path: string;
  /** Original entry name as stored in the ZIP (may include trailing slash). */
  originalEntryName: string;
  sizeBytes: number;
  isDirectory: boolean;
}
