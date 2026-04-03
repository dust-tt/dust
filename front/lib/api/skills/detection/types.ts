import type { SkillAttachmentContentType } from "@app/lib/api/files/use_cases/skill_attachment";

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
