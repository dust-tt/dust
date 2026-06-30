import { isString } from "@app/types/shared/utils/general";

function getFirstRegexCapture(match: RegExpMatchArray | null) {
  const value = match?.[1];
  return value && value.length > 0 ? value : null;
}

const EXACT_NODE_READ_TARGETS = [
  { nodeId: "gdrive-sharedWithMe", target: "Google Drive shared with me" },
  { nodeId: "notion-syncing", target: "Notion syncing resources" },
  { nodeId: "notion-unknown", target: "Notion orphaned resources" },
  { nodeId: "project-context-folder", target: "Dust project context" },
];

const NUMBERED_NODE_READ_TARGETS = [
  { pattern: /^github-issue-\d+-(\d+)$/, target: "GitHub issue" },
  { pattern: /^github-discussion-\d+-(\d+)$/, target: "GitHub discussion" },
  { pattern: /^zendesk-ticket-\d+-\d+-(\d+)$/, target: "Zendesk ticket" },
  { pattern: /^zendesk-article-\d+-\d+-(\d+)$/, target: "Zendesk article" },
];

const PATTERN_NODE_READ_TARGETS = [
  { pattern: /^github-code-\d+-file-[a-f0-9]+$/, target: "GitHub code file" },
  {
    pattern: /^github-code-\d+-dir-[a-f0-9]+$/,
    target: "GitHub code directory",
  },
  { pattern: /^slack-[^-]+-thread-.+$/, target: "Slack thread" },
  { pattern: /^slack-[^-]+-messages-.+$/, target: "Slack messages" },
  {
    pattern: /^salesforce-synced-query-document-\d+-\d+-.+$/,
    target: "Salesforce record",
  },
  {
    pattern: /^dust-project-\d+-project-.+-conversation-.+$/,
    target: "Dust project conversation",
  },
  {
    pattern: /^dust-project-\d+-project-.+-metadata$/,
    target: "Dust project metadata",
  },
  { pattern: /^dust-project-\d+-project-.+$/, target: "Dust project" },
];

const PREFIX_NODE_READ_TARGETS = [
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
  { prefix: "zendesk-category-", target: "Zendesk category" },
  { prefix: "zendesk-help-center-", target: "Zendesk help center" },
  { prefix: "zendesk-brand-", target: "Zendesk brand" },
  { prefix: "zendesk-tickets-", target: "Zendesk tickets" },
  { prefix: "microsoft-", target: "Microsoft content" },
  { prefix: "gong-transcript-folder-", target: "Gong transcripts" },
  { prefix: "gong-transcript-", target: "Gong transcript" },
  { prefix: "salesforce-synced-query-", target: "Salesforce synced query" },
  { prefix: "dpd_", target: "Dust project folder" },
  { prefix: "dpf_", target: "Dust project file" },
];

function getDataSourceFileSystemNodeReadTarget(nodeId: string): string | null {
  for (const exactTarget of EXACT_NODE_READ_TARGETS) {
    if (nodeId === exactTarget.nodeId) {
      return exactTarget.target;
    }
  }

  for (const numberedTarget of NUMBERED_NODE_READ_TARGETS) {
    const itemNumber = getFirstRegexCapture(
      nodeId.match(numberedTarget.pattern)
    );
    if (itemNumber) {
      return `${numberedTarget.target} #${itemNumber}`;
    }
  }

  for (const patternTarget of PATTERN_NODE_READ_TARGETS) {
    if (patternTarget.pattern.test(nodeId)) {
      return patternTarget.target;
    }
  }

  for (const prefixTarget of PREFIX_NODE_READ_TARGETS) {
    if (nodeId.startsWith(prefixTarget.prefix)) {
      return prefixTarget.target;
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
