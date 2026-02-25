import { z } from "zod";

export interface DetectedSkillAttachment {
  name: string;
  path: string;
  sizeBytes: number;
  contentType: string;
}

export interface DetectedSkill {
  name: string;
  dirPath: string;
  description: string;
  instructions: string;
  attachments: DetectedSkillAttachment[];
}

export type SkillDetectionError =
  | { type: "auth_error"; message: string }
  | { type: "not_found"; message: string }
  | { type: "api_error"; message: string };

export interface SkillDirectory {
  dirPath: string;
  skillMdPath: string;
  skillMdSha: string;
}

const GitHubTreeEntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree"]),
  sha: z.string(),
  size: z.number().optional(),
  url: z.string(),
});

export const GitHubTreeResponseSchema = z.object({
  sha: z.string(),
  tree: z.array(GitHubTreeEntrySchema),
  truncated: z.boolean(),
});

export const GitHubBlobResponseSchema = z.object({
  content: z.string(),
  encoding: z.string(),
});

export type GitHubTreeEntry = z.infer<typeof GitHubTreeEntrySchema>;
export type GitHubTreeResponse = z.infer<typeof GitHubTreeResponseSchema>;
export type GitHubBlobResponse = z.infer<typeof GitHubBlobResponseSchema>;
