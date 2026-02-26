import { z } from "zod";

export interface DetectedSkillAttachment {
  name: string;
  path: string;
  sizeBytes: number;
}

export interface DetectedSkill {
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

const GitHubTreeEntrySchema = z
  .object({
    path: z.string(),
    type: z.enum(["blob", "tree"]),
    sha: z.string(),
    size: z.number().optional(),
    url: z.string(),
  })
  .passthrough();

export const GitHubTreeResponseSchema = z
  .object({
    tree: z.array(GitHubTreeEntrySchema),
    truncated: z.boolean(),
  })
  .passthrough();

export const GitHubBlobResponseSchema = z
  .object({
    content: z.string(),
    encoding: z.literal("base64"),
  })
  .passthrough();

export type GitHubTreeEntry = z.infer<typeof GitHubTreeEntrySchema>;
export type GitHubTreeResponse = z.infer<typeof GitHubTreeResponseSchema>;
export type GitHubBlobResponse = z.infer<typeof GitHubBlobResponseSchema>;
