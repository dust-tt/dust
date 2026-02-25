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

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface SkillDirectory {
  dirPath: string;
  skillMdPath: string;
  skillMdSha: string;
}
