import { ConnectorProvider } from "./types";

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
function generateConnectorRelativeMimeTypes<
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

const CONTENT_NODE_MIME_TYPES = {
  CONFLUENCE: generateConnectorRelativeMimeTypes({
    provider: "confluence",
    resourceTypes: ["SPACE", "PAGE"],
  }),
  GITHUB: generateConnectorRelativeMimeTypes({
    provider: "github",
    resourceTypes: [
      "REPOSITORY",
      "CODE_ROOT",
      "CODE_DIRECTORY",
      "CODE_FILE",
      // ISSUES is the folder containing all issues.
      "ISSUES",
      // ISSUE is a single issue.
      "ISSUE",
      // DISCUSSIONS is the folder containing all discussions.
      "DISCUSSIONS",
      // DISCUSSION is a single discussion.
      "DISCUSSION",
    ],
  }),
  GOOGLE_DRIVE: generateConnectorRelativeMimeTypes({
    provider: "google_drive",
    // Spreadsheets may contain many sheets, thus resemble folders and are stored as such, but with
    // the special mimeType below.  For files and sheets, we keep Google's mime types.
    resourceTypes: ["SHARED_WITH_ME", "FOLDER", "SPREADSHEET"],
  }),
  INTERCOM: generateConnectorRelativeMimeTypes({
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
  MICROSOFT: generateConnectorRelativeMimeTypes({
    provider: "microsoft",
    // Spreadsheets may contain many sheets, thus resemble folders and are
    // stored as such, but with the special mimeType below.
    // For files and sheets, we keep Microsoft's mime types.
    resourceTypes: ["FOLDER", "SPREADSHEET"],
  }),
  NOTION: generateConnectorRelativeMimeTypes({
    provider: "notion",
    resourceTypes: ["UNKNOWN_FOLDER", "SYNCING_FOLDER", "DATABASE", "PAGE"],
  }),
  SLACK: generateConnectorRelativeMimeTypes({
    provider: "slack",
    resourceTypes: ["CHANNEL", "THREAD", "MESSAGES"],
  }),
  SNOWFLAKE: generateConnectorRelativeMimeTypes({
    provider: "snowflake",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"],
  }),
  WEBCRAWLER: generateConnectorRelativeMimeTypes({
    provider: "webcrawler",
    resourceTypes: ["FOLDER"], // pages are upserted as text/html, not an internal mime type
  }),
  ZENDESK: generateConnectorRelativeMimeTypes({
    provider: "zendesk",
    resourceTypes: [
      "BRAND",
      "HELP_CENTER",
      "CATEGORY",
      "ARTICLE",
      // TICKETS is the folder containing all tickets.
      "TICKETS",
      // TICKET is a single ticket.
      "TICKET",
    ],
  }),
  BIGQUERY: generateConnectorRelativeMimeTypes({
    provider: "bigquery",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"],
  }),
  SALESFORCE: generateConnectorRelativeMimeTypes({
    provider: "salesforce",
    resourceTypes: ["DATABASE", "SCHEMA", "TABLE"],
  }),
  GONG: generateConnectorRelativeMimeTypes({
    provider: "gong",
    resourceTypes: ["TRANSCRIPT", "TRANSCRIPT_FOLDER"],
  }),
};

const TOOL_INPUT_MIME_TYPES = {
  // If we get other similar mime types we'll add an util function just like above.
  CONFIGURATION: {
    DATA_SOURCE: "application/vnd.dust.data-source-configuration",
  },
};

export const MIME_TYPES = {
  ...CONTENT_NODE_MIME_TYPES,
  ...TOOL_INPUT_MIME_TYPES,
};

export const MIME_TYPES_VALUES = Object.values(MIME_TYPES).flatMap((value) =>
  Object.values(value).map((v) => v)
);

export type BigQueryMimeType =
  (typeof MIME_TYPES.BIGQUERY)[keyof typeof MIME_TYPES.BIGQUERY];

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

export type SalesforceMimeType =
  (typeof MIME_TYPES.SALESFORCE)[keyof typeof MIME_TYPES.SALESFORCE];

export type GongMimeType =
  (typeof MIME_TYPES.GONG)[keyof typeof MIME_TYPES.GONG];

export type DustMimeType =
  | BigQueryMimeType
  | ConfluenceMimeType
  | GithubMimeType
  | GoogleDriveMimeType
  | IntercomMimeType
  | MicrosoftMimeType
  | NotionMimeType
  | SlackMimeType
  | SnowflakeMimeType
  | WebcrawlerMimeType
  | ZendeskMimeType
  | SalesforceMimeType
  | GongMimeType;

export function isDustMimeType(mimeType: string): mimeType is DustMimeType {
  return (MIME_TYPES_VALUES as string[]).includes(mimeType);
}
