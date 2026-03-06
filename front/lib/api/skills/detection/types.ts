export interface DetectedSkillAttachment {
  path: string;
  sizeBytes: number;
}

export interface DetectedSkill {
  name: string;
  skillMdPath: string;
  description: string;
  instructions: string;
  attachments: DetectedSkillAttachment[];
}

export interface SkillDirectory {
  dirPath: string;
  skillMdPath: string;
}

/**
 * Minimal file-entry shape consumed by the shared skill-detection helpers.
 * Both GitHub tree entries and ZIP entries can be adapted to this interface.
 */
export interface FileEntry {
  path: string;
  isFile: boolean;
  sizeBytes: number;
}
