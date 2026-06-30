import { isString } from "@app/types/shared/utils/general";

function getFirstRegexCapture(match: RegExpMatchArray | null) {
  const value = match?.[1];
  return value && value.length > 0 ? value : null;
}

const DATA_SOURCE_FILE_SYSTEM_NODE_READ_TARGETS_BY_ID = {
  "gdrive-sharedWithMe": "Google Drive shared with me",
  "notion-syncing": "Notion syncing resources",
  "notion-unknown": "Notion orphaned resources",
  "project-context-folder": "Dust project context",
} satisfies Record<string, string>;

const DATA_SOURCE_FILE_SYSTEM_NODE_READ_TARGET_PREFIXES = [
  { prefix: "github-code-", target: "GitHub repository code" },
  { prefix: "github-issues-", target: "GitHub issues" },
  { prefix: "github-discussions-", target: "GitHub discussions" },
  { prefix: "github-repository-", target: "GitHub repository" },
  { prefix: "confluence-page-", target: "Confluence page" },
  { prefix: "confluence-folder-", target: "Confluence folder" },
  { prefix: "confluence-space-", target: "Confluence space" },
  { prefix: "google-spreadsheet-", target: "Google Sheets tab" },
  { prefix: "gdrive-", target: "Google Drive file" },
  { prefix: "notion-database-", target: "Notion database" },
  { prefix: "notion-", target: "Notion content" },
  { prefix: "slack-channel-", target: "Slack channel" },
  { prefix: "intercom-article-", target: "Intercom article" },
  { prefix: "intercom-conversation-", target: "Intercom conversation" },
  { prefix: "intercom-collection-", target: "Intercom collection" },
  { prefix: "intercom-help-center-", target: "Intercom help center" },
  { prefix: "intercom-teams-", target: "Intercom conversations" },
  { prefix: "intercom-team-", target: "Intercom team" },
  { prefix: "zendesk-article-", target: "Zendesk article" },
  { prefix: "zendesk-category-", target: "Zendesk category" },
  { prefix: "zendesk-help-center-", target: "Zendesk help center" },
  { prefix: "zendesk-brand-", target: "Zendesk brand" },
  { prefix: "zendesk-tickets-", target: "Zendesk tickets" },
  { prefix: "gong-transcript-folder-", target: "Gong transcripts" },
  { prefix: "gong-transcript-", target: "Gong transcript" },
  { prefix: "salesforce-synced-query-", target: "Salesforce synced query" },
  { prefix: "dpd_", target: "Dust project folder" },
  { prefix: "dpf_", target: "Dust project file" },
];

const MICROSOFT_NODE_READ_TARGETS_BY_TYPE = {
  "sites-root": "Microsoft sites",
  site: "Microsoft site",
  drive: "Microsoft drive",
  folder: "Microsoft folder",
  file: "Microsoft file",
  page: "Microsoft page",
  message: "Microsoft message",
  worksheet: "Microsoft worksheet",
} satisfies Record<string, string>;

function getMicrosoftNodeReadTarget(nodeId: string): string | null {
  if (!nodeId.startsWith("microsoft-")) {
    return null;
  }

  try {
    const decodedId = Buffer.from(
      nodeId.slice("microsoft-".length),
      "base64url"
    ).toString();
    const [nodeType] = decodedId.split("/");

    return (
      MICROSOFT_NODE_READ_TARGETS_BY_TYPE[
        nodeType as keyof typeof MICROSOFT_NODE_READ_TARGETS_BY_TYPE
      ] ?? "Microsoft content"
    );
  } catch {
    return "Microsoft content";
  }
}

function getDataSourceFileSystemNodeReadTarget(nodeId: string): string | null {
  const target =
    DATA_SOURCE_FILE_SYSTEM_NODE_READ_TARGETS_BY_ID[
      nodeId as keyof typeof DATA_SOURCE_FILE_SYSTEM_NODE_READ_TARGETS_BY_ID
    ];
  if (target) {
    return target;
  }

  const githubIssueNumber = getFirstRegexCapture(
    nodeId.match(/^github-issue-\d+-(\d+)$/)
  );
  if (githubIssueNumber) {
    return `GitHub issue #${githubIssueNumber}`;
  }

  const githubDiscussionNumber = getFirstRegexCapture(
    nodeId.match(/^github-discussion-\d+-(\d+)$/)
  );
  if (githubDiscussionNumber) {
    return `GitHub discussion #${githubDiscussionNumber}`;
  }

  if (/^github-code-\d+-file-[a-f0-9]+$/.test(nodeId)) {
    return "GitHub code file";
  }

  if (/^github-code-\d+-dir-[a-f0-9]+$/.test(nodeId)) {
    return "GitHub code directory";
  }

  if (/^slack-[^-]+-thread-.+$/.test(nodeId)) {
    return "Slack thread";
  }

  if (/^slack-[^-]+-messages-.+$/.test(nodeId)) {
    return "Slack messages";
  }

  const zendeskTicketId = getFirstRegexCapture(
    nodeId.match(/^zendesk-ticket-\d+-\d+-(\d+)$/)
  );
  if (zendeskTicketId) {
    return `Zendesk ticket #${zendeskTicketId}`;
  }

  if (/^salesforce-synced-query-document-\d+-\d+-.+$/.test(nodeId)) {
    return "Salesforce record";
  }

  if (/^dust-project-\d+-project-.+-conversation-.+$/.test(nodeId)) {
    return "Dust project conversation";
  }

  if (/^dust-project-\d+-project-.+-metadata$/.test(nodeId)) {
    return "Dust project metadata";
  }

  if (/^dust-project-\d+-project-.+$/.test(nodeId)) {
    return "Dust project";
  }

  const microsoftTarget = getMicrosoftNodeReadTarget(nodeId);
  if (microsoftTarget) {
    return microsoftTarget;
  }

  for (const {
    prefix,
    target,
  } of DATA_SOURCE_FILE_SYSTEM_NODE_READ_TARGET_PREFIXES) {
    if (nodeId.startsWith(prefix)) {
      return target;
    }
  }

  return null;
}

export function getDataSourceFileSystemCatReadTarget(
  inputs: Record<string, unknown>
) {
  if (!isString(inputs.nodeId)) {
    return "file";
  }

  return getDataSourceFileSystemNodeReadTarget(inputs.nodeId) ?? "file";
}
