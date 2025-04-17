export declare const DATA_SOURCE_MIME_TYPE: "application/vnd.dust.datasource";
type DataSourceMimeType = typeof DATA_SOURCE_MIME_TYPE;
export declare const CONTENT_NODE_MIME_TYPES: {
    GENERIC: {
        DATA_SOURCE: "application/vnd.dust.datasource";
    };
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
export declare const INCLUDABLE_INTERNAL_CONTENT_NODE_MIME_TYPES: {
    CONFLUENCE: "application/vnd.dust.confluence.page"[];
    GITHUB: ("application/vnd.dust.github.issue" | "application/vnd.dust.github.discussion")[];
    GOOGLE_DRIVE: never[];
    INTERCOM: ("application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.article")[];
    MICROSOFT: never[];
    NOTION: "application/vnd.dust.notion.page"[];
    SLACK: ("application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages")[];
    SNOWFLAKE: never[];
    WEBCRAWLER: never[];
    ZENDESK: ("application/vnd.dust.zendesk.ticket" | "application/vnd.dust.zendesk.article")[];
    BIGQUERY: never[];
    SALESFORCE: never[];
    GONG: never[];
};
export declare const INTERNAL_MIME_TYPES: {
    TOOL_INPUT: {
        TABLE: "application/vnd.dust.tool_input.table";
        DATA_SOURCE: "application/vnd.dust.tool_input.data-source";
        CHILD_AGENT: "application/vnd.dust.tool_input.child-agent";
        STRING: "application/vnd.dust.tool_input.string";
        NUMBER: "application/vnd.dust.tool_input.number";
        BOOLEAN: "application/vnd.dust.tool_input.boolean";
    };
    TOOL_OUTPUT: {
        FILE: "application/vnd.dust.tool_output.file";
    };
    GENERIC: {
        DATA_SOURCE: "application/vnd.dust.datasource";
    };
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
export declare const INTERNAL_MIME_TYPES_VALUES: ("application/vnd.dust.datasource" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussion" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.article" | "application/vnd.dust.notion.page" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.confluence.space" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.discussions" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder")[];
export declare const INCLUDABLE_INTERNAL_MIME_TYPES_VALUES: ("application/vnd.dust.confluence.page" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussion" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.article" | "application/vnd.dust.notion.page" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.zendesk.article")[];
export type BigQueryMimeType = (typeof INTERNAL_MIME_TYPES.BIGQUERY)[keyof typeof INTERNAL_MIME_TYPES.BIGQUERY];
export type ConfluenceMimeType = (typeof INTERNAL_MIME_TYPES.CONFLUENCE)[keyof typeof INTERNAL_MIME_TYPES.CONFLUENCE];
export type GithubMimeType = (typeof INTERNAL_MIME_TYPES.GITHUB)[keyof typeof INTERNAL_MIME_TYPES.GITHUB];
export type GoogleDriveMimeType = (typeof INTERNAL_MIME_TYPES.GOOGLE_DRIVE)[keyof typeof INTERNAL_MIME_TYPES.GOOGLE_DRIVE];
export type IntercomMimeType = (typeof INTERNAL_MIME_TYPES.INTERCOM)[keyof typeof INTERNAL_MIME_TYPES.INTERCOM];
export type MicrosoftMimeType = (typeof INTERNAL_MIME_TYPES.MICROSOFT)[keyof typeof INTERNAL_MIME_TYPES.MICROSOFT];
export type NotionMimeType = (typeof INTERNAL_MIME_TYPES.NOTION)[keyof typeof INTERNAL_MIME_TYPES.NOTION];
export type SlackMimeType = (typeof INTERNAL_MIME_TYPES.SLACK)[keyof typeof INTERNAL_MIME_TYPES.SLACK];
export type SnowflakeMimeType = (typeof INTERNAL_MIME_TYPES.SNOWFLAKE)[keyof typeof INTERNAL_MIME_TYPES.SNOWFLAKE];
export type WebcrawlerMimeType = (typeof INTERNAL_MIME_TYPES.WEBCRAWLER)[keyof typeof INTERNAL_MIME_TYPES.WEBCRAWLER];
export type ZendeskMimeType = (typeof INTERNAL_MIME_TYPES.ZENDESK)[keyof typeof INTERNAL_MIME_TYPES.ZENDESK];
export type SalesforceMimeType = (typeof INTERNAL_MIME_TYPES.SALESFORCE)[keyof typeof INTERNAL_MIME_TYPES.SALESFORCE];
export type GongMimeType = (typeof INTERNAL_MIME_TYPES.GONG)[keyof typeof INTERNAL_MIME_TYPES.GONG];
export type InternalToolInputMimeType = (typeof INTERNAL_MIME_TYPES.TOOL_INPUT)[keyof typeof INTERNAL_MIME_TYPES.TOOL_INPUT];
export type IncludableInternalMimeType = (typeof INCLUDABLE_INTERNAL_MIME_TYPES_VALUES)[number];
export type DustMimeType = BigQueryMimeType | ConfluenceMimeType | GithubMimeType | GoogleDriveMimeType | IntercomMimeType | MicrosoftMimeType | NotionMimeType | SlackMimeType | SnowflakeMimeType | WebcrawlerMimeType | ZendeskMimeType | SalesforceMimeType | GongMimeType | DataSourceMimeType;
export declare function isDustMimeType(mimeType: string): mimeType is DustMimeType;
export declare function isIncludableInternalMimeType(mimeType: string): mimeType is IncludableInternalMimeType;
export {};
//# sourceMappingURL=internal_mime_types.d.ts.map