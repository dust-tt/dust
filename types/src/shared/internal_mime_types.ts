export const GITHUB_MIME_TYPES = {
  REPOSITORY: "application/vnd.dust.github.repository",
  CODE_ROOT: "application/vnd.dust.github.code.root",
  CODE_DIRECTORY: "application/vnd.dust.github.code.directory",
  CODE_FILE: "application/vnd.dust.github.code.file",
  ISSUES: "application/vnd.dust.github.issues",
  ISSUE: "application/vnd.dust.github.issue",
  DISCUSSIONS: "application/vnd.dust.github.discussions",
  DISCUSSION: "application/vnd.dust.github.discussion",
};

export type GithubMimeType =
  (typeof GITHUB_MIME_TYPES)[keyof typeof GITHUB_MIME_TYPES];

export type DustMimeType = GithubMimeType;
