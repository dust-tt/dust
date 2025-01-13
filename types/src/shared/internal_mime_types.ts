import { ConnectorProvider } from "../front/data_source";

/**
 * This is a utility type that indicates that we removed all underscores from a string.
 * This is used because we don't want underscores in mime types and remove them from connector providers.
 */
type WithoutUnderscores<T extends string> = T extends `${infer A}_${infer B}`
  ? WithoutUnderscores<`${A}${B}`> // operates recursively to remove all underscores
  : T;

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
  [K in T[number]]: `application/vnd.dust.${WithoutUnderscores<P>}.${Lowercase<K>}`;
} {
  return resourceTypes.reduce(
    (acc, s) => ({
      ...acc,
      s: `application/vnd.dust.${provider.replace("_", "")}.${s.toLowerCase()}`,
    }),
    {} as {
      [K in T[number]]: `application/vnd.dust.${WithoutUnderscores<P>}.${Lowercase<K>}`;
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
      "CODE.ROOT",
      "CODE.DIRECTORY",
      "CODE.FILE",
      "ISSUES",
      "ISSUE",
      "DISCUSSIONS",
      "DISCUSSION",
    ],
  }),
  GOOGLE_DRIVE: getMimeTypes({
    provider: "google_drive",
    resourceTypes: ["FOLDER"], // for files and spreadsheets, we keep Google's mime types
  }),
  INTERCOM: getMimeTypes({
    provider: "intercom",
    resourceTypes: [
      "COLLECTION",
      "TEAMS-FOLDER",
      "CONVERSATION",
      "TEAM",
      "HELP-CENTER",
      "ARTICLE",
    ],
  }),
  MICROSOFT: getMimeTypes({
    provider: "microsoft",
    resourceTypes: ["FOLDER"], // for files and spreadsheets, we keep Microsoft's mime types
  }),
  NOTION: getMimeTypes({
    provider: "notion",
    resourceTypes: ["UNKNOWN-FOLDER", "DATABASE", "PAGE"],
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
      "HELPCENTER", // TODO: see if we backfill into HELP-CENTER
      "CATEGORY",
      "ARTICLE",
      "TICKETS",
      "TICKET",
    ],
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
