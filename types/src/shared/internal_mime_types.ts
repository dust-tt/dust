import { ConnectorProvider } from "../front/data_source";

/**
 * This is a utility type that indicates that we removed all underscores from a string.
 * This is used because we don't want underscores in mime types and remove them from connector providers.
 */
type WithoutUnderscores<T extends string> = T extends `${infer A}_${infer B}`
  ? WithoutUnderscores<`${A}${B}`> // operates recursively to remove all underscores
  : T;

/**
 * This is a utility type that indicates that we replaced all underscores with dashes in a string.
 * We don't want underscores in mime types but want to type out the type with one: MIME_TYPE.CAT.SOU_PI_NOU
 */
type UnderscoreToDash<T extends string> = T extends `${infer A}_${infer B}`
  ? UnderscoreToDash<`${A}-${B}`> // operates recursively to replace all underscores
  : T;

/**
 * This function generates mime types for a given provider and resource types.
 * The mime types are in the format `application/vnd.dust.PROVIDER.RESOURCE_TYPE`.
 * Notes:
 * - The underscores in the provider name are stripped in the generated mime type.
 * - The underscores in the resource type are replaced with dashes in the generated mime type.
 */
function getMimeTypes<
  P extends ConnectorProvider,
  T extends Uppercase<string>[]
>({
  provider,
  resourceTypes,
}: {
  provider: P;
  resourceTypes: T;
}): {
  [K in T[number]]: `application/vnd.dust.${WithoutUnderscores<P>}.${Lowercase<
    UnderscoreToDash<K>
  >}`;
} {
  return resourceTypes.reduce(
    (acc, s) => ({
      ...acc,
      [s]: `application/vnd.dust.${provider.replace("_", "")}.${s
        .replace("_", "-")
        .toLowerCase()}`,
    }),
    {} as {
      [K in T[number]]: `application/vnd.dust.${WithoutUnderscores<P>}.${Lowercase<
        UnderscoreToDash<K>
      >}`;
    }
  );
}

export const MIME_TYPES = {
  CONFLUENCE: getMimeTypes({
    provider: "confluence",
    resourceTypes: ["SPACE", "PAGE"],
  }),
  GITHUB: getMimeTypes({
    provider: "github",
    resourceTypes: [
      "REPOSITORY",
      "CODE_ROOT",
      "CODE_DIRECTORY",
      "CODE_FILE",
      "ISSUES",
      "ISSUE",
      "DISCUSSIONS",
      "DISCUSSION",
    ],
  }),
  GOOGLE_DRIVE: getMimeTypes({
    provider: "google_drive",
    // Spreadsheets are handled as data_source_folders for sheets
    // For other files and sheets, we keep Google's mime types
    resourceTypes: ["SHARED_WITH_ME", "FOLDER", "SPREADSHEET"],
  }),
  INTERCOM: getMimeTypes({
    provider: "intercom",
    resourceTypes: [
      "COLLECTION",
      "TEAMS_FOLDER",
      "CONVERSATION",
      "TEAM",
      "ARTICLE",
      "HELP_CENTER",
    ],
  }),
  MICROSOFT: getMimeTypes({
    provider: "microsoft",
    // for files, we keep Microsoft's mime types Spreadsheets, that contain many
    // sheet, resemble folders and are stored as such, but with the special
    // mimetype below
    resourceTypes: ["FOLDER", "SPREADSHEET"],
  }),
  NOTION: getMimeTypes({
    provider: "notion",
    resourceTypes: ["UNKNOWN_FOLDER", "SYNCING_FOLDER", "DATABASE", "PAGE"],
  }),
  SLACK: getMimeTypes({
    provider: "slack",
    resourceTypes: ["CHANNEL", "THREAD", "MESSAGES"],
  }),
  SNOWFLAKE: getMimeTypes({
    provider: "snowflake",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"],
  }),
  WEBCRAWLER: getMimeTypes({
    provider: "webcrawler",
    resourceTypes: ["FOLDER"], // pages are upserted as text/html, not an internal mime type
  }),
  ZENDESK: getMimeTypes({
    provider: "zendesk",
    resourceTypes: [
      "BRAND",
      "HELP_CENTER",
      "CATEGORY",
      "ARTICLE",
      "TICKETS",
      "TICKET",
    ],
  }),
  BIGQUERY: getMimeTypes({
    provider: "bigquery",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"],
  }),
};

export type ConfluenceMimeType =
  (typeof MIME_TYPES.CONFLUENCE)[keyof typeof MIME_TYPES.CONFLUENCE];

export type GithubMimeType =
  (typeof MIME_TYPES.GITHUB)[keyof typeof MIME_TYPES.GITHUB];

export type GoogleDriveMimeType =
  (typeof MIME_TYPES.GOOGLE_DRIVE)[keyof typeof MIME_TYPES.GOOGLE_DRIVE];

export type IntercomMimeType =
  (typeof MIME_TYPES.INTERCOM)[keyof typeof MIME_TYPES.INTERCOM];

export type MicrosoftMimeType =
  (typeof MIME_TYPES.MICROSOFT)[keyof typeof MIME_TYPES.MICROSOFT];

export type NotionMimeType =
  (typeof MIME_TYPES.NOTION)[keyof typeof MIME_TYPES.NOTION];

export type SlackMimeType =
  (typeof MIME_TYPES.SLACK)[keyof typeof MIME_TYPES.SLACK];

export type SnowflakeMimeType =
  (typeof MIME_TYPES.SNOWFLAKE)[keyof typeof MIME_TYPES.SNOWFLAKE];

export type WebcrawlerMimeType =
  (typeof MIME_TYPES.WEBCRAWLER)[keyof typeof MIME_TYPES.WEBCRAWLER];

export type ZendeskMimeType =
  (typeof MIME_TYPES.ZENDESK)[keyof typeof MIME_TYPES.ZENDESK];

export type DustMimeType =
  | ConfluenceMimeType
  | GithubMimeType
  | GoogleDriveMimeType
  | IntercomMimeType
  | MicrosoftMimeType
  | NotionMimeType
  | SlackMimeType
  | SnowflakeMimeType
  | WebcrawlerMimeType
  | ZendeskMimeType;
