import type { SkillAttachmentContentType } from "@app/lib/api/files/use_cases/skill_attachment";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

export type DetectedSkillAttachment = {
  path: string;
  sizeBytes: number;
  contentType: SkillAttachmentContentType;
};

export type DetectedSkill = {
  name: string;
  skillMdPath: string;
  description: string;
  instructions: string;
  attachments: DetectedSkillAttachment[];
};

export type SkillDirectory = {
  dirPath: string;
  skillMdPath: string;
};

export type FileEntry = {
  path: string;
  sizeBytes: number;
};

export type ImportSkillsResult = {
  imported: SkillResource[];
  updated: SkillResource[];
  errors: { name: string; message: string }[];
};
