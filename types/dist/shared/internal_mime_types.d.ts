export declare const MIME_TYPES: {
    CONFLUENCE: {
        SPACE: "application/vnd.dust.confluence.space";
        PAGE: "application/vnd.dust.confluence.page";
    };
    GITHUB: {
        REPOSITORY: "application/vnd.dust.github.repository";
        CODE_ROOT: "application/vnd.dust.github.code-root";
        CODE_DIRECTORY: "application/vnd.dust.github.code-directory";
        CODE_FILE: "application/vnd.dust.github.code-file";
        ISSUES: "application/vnd.dust.github.issues";
        ISSUE: "application/vnd.dust.github.issue";
        DISCUSSIONS: "application/vnd.dust.github.discussions";
        DISCUSSION: "application/vnd.dust.github.discussion";
    };
    GOOGLE_DRIVE: {
        SHARED_WITH_ME: "application/vnd.dust.googledrive.shared-with-me";
        FOLDER: "application/vnd.dust.googledrive.folder";
        SPREADSHEET: "application/vnd.dust.googledrive.spreadsheet";
    };
    INTERCOM: {
        COLLECTION: "application/vnd.dust.intercom.collection";
        TEAMS_FOLDER: "application/vnd.dust.intercom.teams-folder";
        CONVERSATION: "application/vnd.dust.intercom.conversation";
        TEAM: "application/vnd.dust.intercom.team";
        ARTICLE: "application/vnd.dust.intercom.article";
        HELP_CENTER: "application/vnd.dust.intercom.help-center";
    };
    MICROSOFT: {
        FOLDER: "application/vnd.dust.microsoft.folder";
        SPREADSHEET: "application/vnd.dust.microsoft.spreadsheet";
    };
    NOTION: {
        PAGE: "application/vnd.dust.notion.page";
        UNKNOWN_FOLDER: "application/vnd.dust.notion.unknown-folder";
        SYNCING_FOLDER: "application/vnd.dust.notion.syncing-folder";
        DATABASE: "application/vnd.dust.notion.database";
    };
    SLACK: {
        CHANNEL: "application/vnd.dust.slack.channel";
        THREAD: "application/vnd.dust.slack.thread";
        MESSAGES: "application/vnd.dust.slack.messages";
    };
    SNOWFLAKE: {
        DATABASE: "application/vnd.dust.snowflake.database";
        SCHEMA: "application/vnd.dust.snowflake.schema";
        TABLE: "application/vnd.dust.snowflake.table";
    };
    WEBCRAWLER: {
        FOLDER: "application/vnd.dust.webcrawler.folder";
    };
    ZENDESK: {
        ARTICLE: "application/vnd.dust.zendesk.article";
        HELP_CENTER: "application/vnd.dust.zendesk.help-center";
        BRAND: "application/vnd.dust.zendesk.brand";
        CATEGORY: "application/vnd.dust.zendesk.category";
        TICKETS: "application/vnd.dust.zendesk.tickets";
        TICKET: "application/vnd.dust.zendesk.ticket";
    };
    BIGQUERY: {
        DATABASE: "application/vnd.dust.bigquery.database";
        SCHEMA: "application/vnd.dust.bigquery.schema";
        TABLE: "application/vnd.dust.bigquery.table";
    };
    SALESFORCE: {
        DATABASE: "application/vnd.dust.salesforce.database";
        SCHEMA: "application/vnd.dust.salesforce.schema";
        TABLE: "application/vnd.dust.salesforce.table";
    };
    GONG: {
        TRANSCRIPT: "application/vnd.dust.gong.transcript";
        TRANSCRIPT_FOLDER: "application/vnd.dust.gong.transcript-folder";
    };
};
export type BigQueryMimeType = (typeof MIME_TYPES.BIGQUERY)[keyof typeof MIME_TYPES.BIGQUERY];
export type ConfluenceMimeType = (typeof MIME_TYPES.CONFLUENCE)[keyof typeof MIME_TYPES.CONFLUENCE];
export type GithubMimeType = (typeof MIME_TYPES.GITHUB)[keyof typeof MIME_TYPES.GITHUB];
export type GoogleDriveMimeType = (typeof MIME_TYPES.GOOGLE_DRIVE)[keyof typeof MIME_TYPES.GOOGLE_DRIVE];
export type IntercomMimeType = (typeof MIME_TYPES.INTERCOM)[keyof typeof MIME_TYPES.INTERCOM];
export type MicrosoftMimeType = (typeof MIME_TYPES.MICROSOFT)[keyof typeof MIME_TYPES.MICROSOFT];
export type NotionMimeType = (typeof MIME_TYPES.NOTION)[keyof typeof MIME_TYPES.NOTION];
export type SlackMimeType = (typeof MIME_TYPES.SLACK)[keyof typeof MIME_TYPES.SLACK];
export type SnowflakeMimeType = (typeof MIME_TYPES.SNOWFLAKE)[keyof typeof MIME_TYPES.SNOWFLAKE];
export type WebcrawlerMimeType = (typeof MIME_TYPES.WEBCRAWLER)[keyof typeof MIME_TYPES.WEBCRAWLER];
export type ZendeskMimeType = (typeof MIME_TYPES.ZENDESK)[keyof typeof MIME_TYPES.ZENDESK];
export type SalesforceMimeType = (typeof MIME_TYPES.SALESFORCE)[keyof typeof MIME_TYPES.SALESFORCE];
export type DustMimeType = BigQueryMimeType | ConfluenceMimeType | GithubMimeType | GoogleDriveMimeType | IntercomMimeType | MicrosoftMimeType | NotionMimeType | SlackMimeType | SnowflakeMimeType | WebcrawlerMimeType | ZendeskMimeType | SalesforceMimeType;
//# sourceMappingURL=internal_mime_types.d.ts.map