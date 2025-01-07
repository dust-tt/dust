export const CONFLUENCE_MIME_TYPES = {
  SPACE: "application/vnd.dust.confluence.space",
  PAGE: "application/vnd.dust.confluence.page",
};

export type ConfluenceMimeType =
  (typeof CONFLUENCE_MIME_TYPES)[keyof typeof CONFLUENCE_MIME_TYPES];

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

export const GOOGLE_DRIVE_MIME_TYPES = {
  FOLDER: "application/vnd.dust.googledrive.folder",
  // for files and spreadsheets, we keep Google's mime types
};

export type GoogleDriveMimeType =
  (typeof GOOGLE_DRIVE_MIME_TYPES)[keyof typeof GOOGLE_DRIVE_MIME_TYPES];

export const INTERCOM_MIME_TYPES = {
  COLLECTION: "application/vnd.dust.intercom.collection",
  CONVERSATIONS: "application/vnd.dust.intercom.teams-folder",
  TEAM: "application/vnd.dust.intercom.team",
  HELP_CENTER: "application/vnd.dust.intercom.help-center",
};

export type IntercomMimeType =
  (typeof INTERCOM_MIME_TYPES)[keyof typeof INTERCOM_MIME_TYPES];

export type DustMimeType =
  | ConfluenceMimeType
  | GithubMimeType
  | GoogleDriveMimeType
  | IntercomMimeType;
