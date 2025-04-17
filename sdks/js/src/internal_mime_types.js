/**
 * This function generates mime types for a given provider and resource types.
 * The mime types are in the format `application/vnd.dust.PROVIDER.RESOURCE_TYPE`.
 * Notes:
 * - The underscores in the provider name are stripped in the generated mime type.
 * - The underscores in the resource type are replaced with dashes in the generated mime type.
 */
function generateConnectorRelativeMimeTypes({ provider, resourceTypes, }) {
    return resourceTypes.reduce((acc, s) => (Object.assign(Object.assign({}, acc), { [s]: `application/vnd.dust.${provider.replace("_", "")}.${s
            .replace("_", "-")
            .toLowerCase()}` })), {});
}
// Mime type that represents a datasource.
export const DATA_SOURCE_MIME_TYPE = "application/vnd.dust.datasource";
export const CONTENT_NODE_MIME_TYPES = {
    GENERIC: { DATA_SOURCE: DATA_SOURCE_MIME_TYPE },
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
export const INCLUDABLE_INTERNAL_CONTENT_NODE_MIME_TYPES = {
    CONFLUENCE: [CONTENT_NODE_MIME_TYPES.CONFLUENCE.PAGE],
    GITHUB: [
        CONTENT_NODE_MIME_TYPES.GITHUB.ISSUE,
        CONTENT_NODE_MIME_TYPES.GITHUB.DISCUSSION,
    ],
    GOOGLE_DRIVE: [],
    INTERCOM: [
        CONTENT_NODE_MIME_TYPES.INTERCOM.CONVERSATION,
        CONTENT_NODE_MIME_TYPES.INTERCOM.ARTICLE,
    ],
    MICROSOFT: [],
    NOTION: [CONTENT_NODE_MIME_TYPES.NOTION.PAGE],
    SLACK: [
        CONTENT_NODE_MIME_TYPES.SLACK.THREAD,
        CONTENT_NODE_MIME_TYPES.SLACK.MESSAGES,
    ],
    SNOWFLAKE: [],
    WEBCRAWLER: [],
    ZENDESK: [
        CONTENT_NODE_MIME_TYPES.ZENDESK.TICKET,
        CONTENT_NODE_MIME_TYPES.ZENDESK.ARTICLE,
    ],
    BIGQUERY: [],
    SALESFORCE: [],
    GONG: [],
};
function generateToolMimeTypes({ category, resourceTypes, }) {
    return resourceTypes.reduce((acc, s) => (Object.assign(Object.assign({}, acc), { [s]: `application/vnd.dust.${category.toLowerCase()}.${s
            .replace(/_/g, "-")
            .toLowerCase()}` })), {});
}
const TOOL_INPUT_MIME_TYPES = {
    TOOL_INPUT: generateToolMimeTypes({
        category: "TOOL_INPUT",
        resourceTypes: [
            "DATA_SOURCE",
            "TABLE",
            "CHILD_AGENT",
            "STRING",
            "NUMBER",
            "BOOLEAN",
        ],
    }),
    TOOL_OUTPUT: generateToolMimeTypes({
        category: "TOOL_OUTPUT",
        resourceTypes: ["FILE"],
    }),
};
export const INTERNAL_MIME_TYPES = Object.assign(Object.assign({}, CONTENT_NODE_MIME_TYPES), TOOL_INPUT_MIME_TYPES);
export const INTERNAL_MIME_TYPES_VALUES = Object.values(CONTENT_NODE_MIME_TYPES).flatMap((value) => Object.values(value).map((v) => v));
export const INCLUDABLE_INTERNAL_MIME_TYPES_VALUES = Object.values(INCLUDABLE_INTERNAL_CONTENT_NODE_MIME_TYPES).flatMap((value) => Object.values(value).map((v) => v));
export function isDustMimeType(mimeType) {
    return INTERNAL_MIME_TYPES_VALUES.includes(mimeType);
}
export function isIncludableInternalMimeType(mimeType) {
    return INCLUDABLE_INTERNAL_MIME_TYPES_VALUES.includes(mimeType);
}
//# sourceMappingURL=internal_mime_types.js.map