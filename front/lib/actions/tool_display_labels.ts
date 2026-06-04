import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getInternalMCPServerToolDisplayLabels,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import {
  isDataSourceFilesystemFindInputType,
  isGenerateImageInputType,
  isSearchInputTypeWithTags,
  isWebbrowseInputType,
  isWebsearchInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import { stripFileExtension } from "@app/types/files";
import {
  isNumber,
  isString,
  isStringArray,
} from "@app/types/shared/utils/general";
import { asDisplayName, slugify } from "@app/types/shared/utils/string_utils";

type ToolDisplayLabelsByTool = Record<string, ToolDisplayLabels>;

const MAX_QUERY_DISPLAY_LENGTH = 60;

function truncateQuery(query: string): string {
  return query.length > MAX_QUERY_DISPLAY_LENGTH
    ? query.slice(0, MAX_QUERY_DISPLAY_LENGTH) + "…"
    : query;
}

function shortenUrl(url: string): string {
  return truncateQuery(url.replace(/^https?:\/\//, ""));
}

function formatStringList(values: string[]): string {
  return truncateQuery(values.join(", "));
}

const INTERNAL_TOOL_DISPLAY_LABELS_BY_SERVER = Object.fromEntries(
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES.flatMap((serverName) => {
    const displayLabels = getInternalMCPServerToolDisplayLabels(serverName);

    if (!displayLabels) {
      return [];
    }

    return [[slugify(serverName), displayLabels] as const];
  })
) as Record<string, ToolDisplayLabelsByTool>;

const DEFAULT_REMOTE_TOOL_DISPLAY_LABELS_BY_SERVER = Object.fromEntries(
  DEFAULT_REMOTE_MCP_SERVERS.flatMap((server) => {
    if (!server.toolDisplayLabels) {
      return [];
    }

    return [[slugify(server.name), server.toolDisplayLabels] as const];
  })
) as Record<string, ToolDisplayLabelsByTool>;

function getToolCallNameParts(functionCallName: string) {
  const separatorIndex = functionCallName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (separatorIndex === -1) {
    return null;
  }

  return {
    serverName: functionCallName.slice(0, separatorIndex),
    toolName: functionCallName.slice(
      separatorIndex + TOOL_NAME_SEPARATOR.length
    ),
  };
}

/**
 * Generate input-aware dynamic labels for internal MCP server tools.
 */
function getDynamicToolDisplayLabels({
  internalMCPServerName,
  toolName,
  inputs,
}: {
  internalMCPServerName: InternalMCPServerNameType;
  toolName: string;
  inputs: Record<string, unknown>;
}): ToolDisplayLabels | null {
  switch (internalMCPServerName) {
    case "web_search_&_browse":
    case "http_client":
      if (toolName === "websearch" && isWebsearchInputType(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Search “${q}”`,
        };
      }
      if (toolName === "webbrowser" && isWebbrowseInputType(inputs)) {
        if (inputs.urls.length === 1) {
          const url = shortenUrl(inputs.urls[0]);
          return {
            running: `Browsing “${url}”`,
            done: `Browse “${url}”`,
          };
        }
        return {
          running: `Browsing ${inputs.urls.length} web pages`,
          done: `Browse ${inputs.urls.length} web pages`,
        };
      }
      return null;

    case "pod_manager":
      if (toolName === "semantic_search" && isSearchInputTypeWithTags(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}” in Pod`,
          done: `Search “${q}” in Pod`,
        };
      }
      return null;

    case "search":
      if (toolName === "semantic_search" && isSearchInputTypeWithTags(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Search “${q}”`,
        };
      }
      return null;

    case "data_sources_file_system":
      if (
        toolName === "find" &&
        isDataSourceFilesystemFindInputType(inputs) &&
        inputs.query
      ) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Finding “${q}”`,
          done: `Find “${q}”`,
        };
      }
      if (toolName === "semantic_search" && isSearchInputTypeWithTags(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Search “${q}”`,
        };
      }
      if (toolName === "cat") {
        if (isString(inputs.grep)) {
          const g = truncateQuery(inputs.grep);
          return {
            running: `Searching for “${g}” in file`,
            done: `Search for “${g}” in file`,
          };
        }
        const offset = isNumber(inputs.offset)
          ? inputs.offset.toLocaleString()
          : null;
        const limit = isNumber(inputs.limit)
          ? inputs.limit.toLocaleString()
          : null;

        if (offset && limit) {
          return {
            running: `Reading file (next ~${limit} characters)`,
            done: `Read file (next ~${limit} characters)`,
          };
        } else if (limit) {
          return {
            running: `Reading file (first ~${limit} characters)`,
            done: `Read file (first ~${limit} characters)`,
          };
        } else if (offset) {
          return {
            running: `Reading file (from character ${offset})`,
            done: `Read file (from character ${offset})`,
          };
        }
        return {
          running: `Reading file`,
          done: `Read file`,
        };
      }
      return null;

    case "image_generation":
      if (toolName === "generate_image" && isGenerateImageInputType(inputs)) {
        const name = truncateQuery(stripFileExtension(inputs.outputName));
        return {
          running: `Generating “${name}”`,
          done: `Generate “${name}”`,
        };
      }
      return null;

    case "gmail":
      if (
        (toolName === "get_drafts" || toolName === "get_messages") &&
        isString(inputs.q)
      ) {
        const q = truncateQuery(inputs.q);
        return {
          running: `Searching Gmail “${q}”`,
          done: `Search Gmail “${q}”`,
        };
      }
      if (toolName === "create_draft" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Drafting “${s}”`,
          done: `Draft “${s}”`,
        };
      }
      if (toolName === "send_mail" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Sending “${s}”`,
          done: `Send “${s}”`,
        };
      }
      if (toolName === "delete_draft" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Deleting draft “${s}”`,
          done: `Delete draft “${s}”`,
        };
      }
      if (toolName === "get_attachment" && isString(inputs.filename)) {
        const name = truncateQuery(inputs.filename);
        return {
          running: `Getting attachment “${name}”`,
          done: `Get attachment “${name}”`,
        };
      }
      return null;

    case "slack":
    case "slack_bot":
      if (toolName === "post_message") {
        if (isString(inputs.to)) {
          const to = truncateQuery(inputs.to);
          return {
            running: `Posting to channel ${to}`,
            done: `Post to channel ${to}`,
          };
        }
        if (isStringArray(inputs.to)) {
          const to = `${inputs.to.length} recipients`;
          return {
            running: `Posting to ${to}`,
            done: `Post to ${to}`,
          };
        }
      }
      if (
        toolName === "search_messages" &&
        isStringArray(inputs.keywords) &&
        inputs.keywords.length > 0
      ) {
        const keywords = formatStringList(inputs.keywords);
        return {
          running: `Searching Slack “${keywords}”`,
          done: `Search Slack “${keywords}”`,
        };
      }
      if (toolName === "semantic_search_messages" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Slack “${q}”`,
          done: `Search Slack “${q}”`,
        };
      }
      if (toolName === "schedule_message" && isString(inputs.to)) {
        const to = truncateQuery(inputs.to);
        return {
          running: `Scheduling message to ${to}`,
          done: `Schedule message to ${to}`,
        };
      }
      if (toolName === "search_user" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Slack user “${q}”`,
          done: `Search Slack user “${q}”`,
        };
      }
      if (toolName === "search_channels" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Slack channels “${q}”`,
          done: `Search Slack channels “${q}”`,
        };
      }
      if (toolName === "list_messages" && isString(inputs.channel)) {
        const channel = truncateQuery(inputs.channel);
        return {
          running: `Listing Slack messages in ${channel}`,
          done: `List Slack messages in ${channel}`,
        };
      }
      if (toolName === "read_thread_messages" && isString(inputs.channel)) {
        const channel = truncateQuery(inputs.channel);
        return {
          running: `Reading Slack thread in ${channel}`,
          done: `Read Slack thread in ${channel}`,
        };
      }
      if (toolName === "create_channel" && isString(inputs.name)) {
        const name = truncateQuery(inputs.name);
        return {
          running: `Creating Slack channel ${name}`,
          done: `Create Slack channel ${name}`,
        };
      }
      if (toolName === "invite_to_channel" && isString(inputs.channel)) {
        const channel = truncateQuery(inputs.channel);
        return {
          running: `Inviting users to Slack channel ${channel}`,
          done: `Invite users to Slack channel ${channel}`,
        };
      }
      if (toolName === "archive_channel" && isString(inputs.channel)) {
        const channel = truncateQuery(inputs.channel);
        return {
          running: `Archiving Slack channel ${channel}`,
          done: `Archive Slack channel ${channel}`,
        };
      }
      return null;

    case "notion":
      if (toolName === "search" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Notion “${q}”`,
          done: `Search Notion “${q}”`,
        };
      }
      return null;

    case "extract_data":
      if (
        toolName === "extract_information_from_documents" &&
        isString(inputs.objective)
      ) {
        const o = truncateQuery(inputs.objective);
        return {
          running: `Extracting “${o}”`,
          done: `Extract “${o}”`,
        };
      }
      return null;

    case "conversation_files":
      if (toolName === "semantic_search" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching files “${q}”`,
          done: `Search files “${q}”`,
        };
      }
      if (toolName === "cat") {
        if (isString(inputs.grep)) {
          const g = truncateQuery(inputs.grep);
          return {
            running: `Searching for “${g}” in file`,
            done: `Search for “${g}” in file`,
          };
        }
        const offset = isNumber(inputs.offset)
          ? inputs.offset.toLocaleString()
          : null;
        const limit = isNumber(inputs.limit)
          ? inputs.limit.toLocaleString()
          : null;

        if (offset && limit) {
          return {
            running: `Reading file (next ~${limit} characters)`,
            done: `Read file (next ~${limit} characters)`,
          };
        } else if (limit) {
          return {
            running: `Reading file (first ~${limit} characters)`,
            done: `Read file (first ~${limit} characters)`,
          };
        } else if (offset) {
          return {
            running: `Reading file (from character ${offset})`,
            done: `Read file (from character ${offset})`,
          };
        }
        return {
          running: `Reading file`,
          done: `Read file`,
        };
      }
      return null;

    case "files":
      if (toolName === "cat" && isString(inputs.path)) {
        const path = truncateQuery(inputs.path);
        return {
          running: `Reading “${path}”`,
          done: `Read “${path}”`,
        };
      }
      if (
        toolName === "grep" &&
        isString(inputs.path) &&
        isString(inputs.pattern)
      ) {
        const path = truncateQuery(inputs.path);
        const pattern = truncateQuery(inputs.pattern);
        return {
          running: `Searching “${pattern}” in “${path}”`,
          done: `Search “${pattern}” in “${path}”`,
        };
      }
      if (toolName === "create" && isString(inputs.path)) {
        const path = truncateQuery(inputs.path);
        return {
          running: `Writing “${path}”`,
          done: `Write “${path}”`,
        };
      }
      if (toolName === "delete" && isString(inputs.path)) {
        const path = truncateQuery(inputs.path);
        return {
          running: `Deleting “${path}”`,
          done: `Delete “${path}”`,
        };
      }
      if (
        (toolName === "copy" || toolName === "move") &&
        isString(inputs.source) &&
        isString(inputs.dest)
      ) {
        const source = truncateQuery(inputs.source);
        const dest = truncateQuery(inputs.dest);
        const verb = toolName === "copy" ? "Copying" : "Moving";
        const past = toolName === "copy" ? "Copy" : "Move";
        return {
          running: `${verb} “${source}” to “${dest}”`,
          done: `${past} “${source}” to “${dest}”`,
        };
      }
      if (toolName === "resolve" && isString(inputs.file_id)) {
        const fileId = truncateQuery(inputs.file_id);
        return {
          running: `Resolving file “${fileId}”`,
          done: `Resolve file “${fileId}”`,
        };
      }
      return null;

    case "github": {
      const base =
        isString(inputs.owner) && isString(inputs.repo)
          ? `github.com/${inputs.owner}/${inputs.repo}`
          : null;
      if (
        toolName === "get_pull_request" &&
        base &&
        isNumber(inputs.pullNumber)
      ) {
        const url = `${base}/pull/${inputs.pullNumber}`;
        return {
          running: `Retrieving ${url}`,
          done: `Retrieve ${url}`,
        };
      }
      if (toolName === "get_issue" && base && isNumber(inputs.issueNumber)) {
        const url = `${base}/issues/${inputs.issueNumber}`;
        return {
          running: `Retrieving ${url}`,
          done: `Retrieve ${url}`,
        };
      }
      if (toolName === "create_issue" && base && isString(inputs.title)) {
        const t = truncateQuery(inputs.title);
        return {
          running: `Creating issue on ${base}: “${t}”`,
          done: `Create issue on ${base}: “${t}”`,
        };
      }
      if (
        toolName === "comment_on_issue" &&
        base &&
        isNumber(inputs.issueNumber)
      ) {
        const url = `${base}/issues/${inputs.issueNumber}`;
        return {
          running: `Commenting on ${url}`,
          done: `Comment on ${url}`,
        };
      }
      if (
        toolName === "create_pull_request_review" &&
        base &&
        isNumber(inputs.pullNumber)
      ) {
        const url = `${base}/pull/${inputs.pullNumber}`;
        return {
          running: `Reviewing ${url}`,
          done: `Review ${url}`,
        };
      }
      if (toolName === "list_issues" && base) {
        return {
          running: `Listing issues on ${base}`,
          done: `List issues on ${base}`,
        };
      }
      if (toolName === "list_pull_requests" && base) {
        return {
          running: `Listing PRs on ${base}`,
          done: `List PRs on ${base}`,
        };
      }
      return null;
    }

    case "google_calendar":
      if (toolName === "create_event" && isString(inputs.summary)) {
        const s = truncateQuery(inputs.summary);
        return {
          running: `Creating event “${s}”`,
          done: `Create event “${s}”`,
        };
      }
      if (toolName === "update_event" && isString(inputs.summary)) {
        const s = truncateQuery(inputs.summary);
        return {
          running: `Updating event “${s}”`,
          done: `Update event “${s}”`,
        };
      }
      return null;

    case "outlook_calendar":
      if (
        (toolName === "create_event" || toolName === "update_event") &&
        isString(inputs.subject)
      ) {
        const s = truncateQuery(inputs.subject);
        const verb = toolName === "create_event" ? "Creating" : "Updating";
        const past = toolName === "create_event" ? "Create" : "Update";
        return {
          running: `${verb} event “${s}”`,
          done: `${past} event “${s}”`,
        };
      }
      return null;

    case "outlook":
      if (toolName === "create_draft" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Drafting “${s}”`,
          done: `Draft “${s}”`,
        };
      }
      return null;

    case "google_drive":
      if (toolName === "search_files" && isString(inputs.q)) {
        const q = truncateQuery(inputs.q);
        return {
          running: `Searching Drive “${q}”`,
          done: `Search Drive “${q}”`,
        };
      }
      if (
        (toolName === "create_document" ||
          toolName === "create_spreadsheet" ||
          toolName === "create_presentation") &&
        isString(inputs.title)
      ) {
        const t = truncateQuery(inputs.title);
        return {
          running: `Creating “${t}”`,
          done: `Create “${t}”`,
        };
      }
      if (toolName === "get_worksheet" && isString(inputs.range)) {
        const range = truncateQuery(inputs.range);
        return {
          running: `Retrieving worksheet range “${range}”`,
          done: `Retrieve worksheet range “${range}”`,
        };
      }
      if (toolName === "copy_file" && isString(inputs.name)) {
        const name = truncateQuery(inputs.name);
        return {
          running: `Copying Drive file to “${name}”`,
          done: `Copy Drive file to “${name}”`,
        };
      }
      if (toolName === "share_file") {
        const recipient = isString(inputs.emailAddress)
          ? truncateQuery(inputs.emailAddress)
          : isString(inputs.domain)
            ? truncateQuery(inputs.domain)
            : null;
        if (recipient) {
          return {
            running: `Sharing Drive file with ${recipient}`,
            done: `Share Drive file with ${recipient}`,
          };
        }
      }
      if (toolName === "create_comment" && isString(inputs.content)) {
        const content = truncateQuery(inputs.content);
        return {
          running: `Commenting on Drive file: ${content}`,
          done: `Comment on Drive file: ${content}`,
        };
      }
      return null;

    case "google_sheets":
      if (toolName === "list_spreadsheets" && isString(inputs.nameFilter)) {
        const q = truncateQuery(inputs.nameFilter);
        return {
          running: `Listing Sheets matching “${q}”`,
          done: `List Sheets matching “${q}”`,
        };
      }
      if (
        (toolName === "get_worksheet" ||
          toolName === "update_cells" ||
          toolName === "append_data" ||
          toolName === "clear_range") &&
        isString(inputs.range)
      ) {
        const range = truncateQuery(inputs.range);
        const verb =
          toolName === "get_worksheet"
            ? "Reading"
            : toolName === "update_cells"
              ? "Updating"
              : toolName === "append_data"
                ? "Appending to"
                : "Clearing";
        const past =
          toolName === "get_worksheet"
            ? "Read"
            : toolName === "update_cells"
              ? "Update"
              : toolName === "append_data"
                ? "Append to"
                : "Clear";
        return {
          running: `${verb} Sheets range “${range}”`,
          done: `${past} Sheets range “${range}”`,
        };
      }
      if (toolName === "create_spreadsheet" && isString(inputs.title)) {
        const title = truncateQuery(inputs.title);
        return {
          running: `Creating spreadsheet “${title}”`,
          done: `Create spreadsheet “${title}”`,
        };
      }
      if (toolName === "add_worksheet" && isString(inputs.title)) {
        const title = truncateQuery(inputs.title);
        return {
          running: `Adding worksheet “${title}”`,
          done: `Add worksheet “${title}”`,
        };
      }
      if (toolName === "rename_worksheet" && isString(inputs.newTitle)) {
        const title = truncateQuery(inputs.newTitle);
        return {
          running: `Renaming worksheet to “${title}”`,
          done: `Rename worksheet to “${title}”`,
        };
      }
      return null;

    case "microsoft_drive":
      if (
        (toolName === "search_in_files" || toolName === "search_drive_items") &&
        isString(inputs.query)
      ) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching OneDrive/SharePoint “${q}”`,
          done: `Search OneDrive/SharePoint “${q}”`,
        };
      }
      if (toolName === "upload_file") {
        const name = isString(inputs.fileName)
          ? truncateQuery(inputs.fileName)
          : isString(inputs.fileId)
            ? truncateQuery(inputs.fileId)
            : null;
        if (name) {
          return {
            running: `Uploading “${name}” to OneDrive/SharePoint`,
            done: `Upload “${name}” to OneDrive/SharePoint`,
          };
        }
      }
      if (toolName === "copy_file" && isString(inputs.name)) {
        const name = truncateQuery(inputs.name);
        return {
          running: `Copying OneDrive/SharePoint file to “${name}”`,
          done: `Copy OneDrive/SharePoint file to “${name}”`,
        };
      }
      return null;

    case "microsoft_excel":
      if (toolName === "list_excel_files" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Listing Excel files matching “${q}”`,
          done: `List Excel files matching “${q}”`,
        };
      }
      if (
        (toolName === "read_worksheet" ||
          toolName === "write_worksheet" ||
          toolName === "clear_range") &&
        isString(inputs.worksheetName)
      ) {
        const worksheetName = truncateQuery(inputs.worksheetName);
        const range = isString(inputs.range)
          ? ` range “${truncateQuery(inputs.range)}”`
          : "";
        const verb =
          toolName === "read_worksheet"
            ? "Reading"
            : toolName === "write_worksheet"
              ? "Writing"
              : "Clearing";
        const past =
          toolName === "read_worksheet"
            ? "Read"
            : toolName === "write_worksheet"
              ? "Write"
              : "Clear";
        return {
          running: `${verb} Excel worksheet “${worksheetName}”${range}`,
          done: `${past} Excel worksheet “${worksheetName}”${range}`,
        };
      }
      if (toolName === "create_worksheet" && isString(inputs.worksheetName)) {
        const worksheetName = truncateQuery(inputs.worksheetName);
        return {
          running: `Creating Excel worksheet “${worksheetName}”`,
          done: `Create Excel worksheet “${worksheetName}”`,
        };
      }
      return null;

    case "microsoft_teams":
      if (toolName === "search_messages_content" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Teams messages “${q}”`,
          done: `Search Teams messages “${q}”`,
        };
      }
      if (
        (toolName === "list_users" ||
          toolName === "list_channels" ||
          toolName === "list_chats") &&
        isString(inputs.nameFilter)
      ) {
        const q = truncateQuery(inputs.nameFilter);
        return {
          running: `Listing Teams results matching “${q}”`,
          done: `List Teams results matching “${q}”`,
        };
      }
      if (toolName === "post_message" && isString(inputs.targetType)) {
        const targetType = truncateQuery(inputs.targetType);
        return {
          running: `Posting Teams message to ${targetType}`,
          done: `Post Teams message to ${targetType}`,
        };
      }
      if (toolName === "list_meetings" && isString(inputs.subjectFilter)) {
        const subject = truncateQuery(inputs.subjectFilter);
        return {
          running: `Listing Teams meetings “${subject}”`,
          done: `List Teams meetings “${subject}”`,
        };
      }
      if (toolName === "get_transcript_content" && isString(inputs.joinUrl)) {
        const url = shortenUrl(inputs.joinUrl);
        return {
          running: `Getting Teams transcript for “${url}”`,
          done: `Get Teams transcript for “${url}”`,
        };
      }
      return null;

    case "salesforce":
      if (toolName === "execute_read_query" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Executing Salesforce query “${q}”`,
          done: `Execute Salesforce query “${q}”`,
        };
      }
      if (toolName === "describe_object" && isString(inputs.objectName)) {
        const objectName = truncateQuery(inputs.objectName);
        return {
          running: `Describing Salesforce object ${objectName}`,
          done: `Describe Salesforce object ${objectName}`,
        };
      }
      if (
        (toolName === "create_object" || toolName === "update_object") &&
        isString(inputs.objectName)
      ) {
        const objectName = truncateQuery(inputs.objectName);
        const verb = toolName === "create_object" ? "Creating" : "Updating";
        const past = toolName === "create_object" ? "Create" : "Update";
        return {
          running: `${verb} Salesforce ${objectName} records`,
          done: `${past} Salesforce ${objectName} records`,
        };
      }
      if (
        (toolName === "list_attachments" || toolName === "read_attachment") &&
        isString(inputs.recordId)
      ) {
        const recordId = truncateQuery(inputs.recordId);
        const verb = toolName === "list_attachments" ? "Listing" : "Reading";
        const past = toolName === "list_attachments" ? "List" : "Read";
        return {
          running: `${verb} Salesforce attachments for ${recordId}`,
          done: `${past} Salesforce attachments for ${recordId}`,
        };
      }
      return null;

    case "zendesk":
      if (toolName === "get_ticket" && isNumber(inputs.ticketId)) {
        return {
          running: `Retrieving Zendesk ticket ${inputs.ticketId}`,
          done: `Retrieve Zendesk ticket ${inputs.ticketId}`,
        };
      }
      if (toolName === "search_tickets" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Zendesk tickets “${q}”`,
          done: `Search Zendesk tickets “${q}”`,
        };
      }
      if (
        (toolName === "draft_reply" ||
          toolName === "post_reply" ||
          toolName === "update_ticket_tags") &&
        isNumber(inputs.ticketId)
      ) {
        const verb =
          toolName === "draft_reply"
            ? "Drafting reply to"
            : toolName === "post_reply"
              ? "Posting reply to"
              : "Updating tags on";
        const past =
          toolName === "draft_reply"
            ? "Draft reply to"
            : toolName === "post_reply"
              ? "Post reply to"
              : "Update tags on";
        return {
          running: `${verb} Zendesk ticket ${inputs.ticketId}`,
          done: `${past} Zendesk ticket ${inputs.ticketId}`,
        };
      }
      return null;

    case "sandbox":
      if (toolName === "bash" && isString(inputs.description)) {
        const t = truncateQuery(inputs.description);
        return { running: t, done: t };
      }
      return null;

    case "query_tables_v2":
      if (
        toolName === "execute_database_query" &&
        isString(inputs.description)
      ) {
        const t = truncateQuery(inputs.description);
        return { running: t, done: t };
      }
      return null;

    case "data_warehouses":
      if (toolName === "query" && isString(inputs.description)) {
        const t = truncateQuery(inputs.description);
        return { running: t, done: t };
      }
      return null;

    case "file_generation":
      if (
        (toolName === "generate_file" || toolName === "convert_file_format") &&
        isString(inputs.file_name)
      ) {
        const name = truncateQuery(inputs.file_name);
        const verb = toolName === "generate_file" ? "Generating" : "Converting";
        const past = toolName === "generate_file" ? "Generate" : "Convert";
        return {
          running: `${verb} “${name}”`,
          done: `${past} “${name}”`,
        };
      }
      return null;

    case "run_agent":
      if (isString(inputs.description)) {
        const d = truncateQuery(inputs.description);
        return { running: d, done: d };
      }
      return null;

    case "interactive_content":
      if (
        toolName === "create_interactive_content_file" &&
        isString(inputs.file_name)
      ) {
        const name = truncateQuery(inputs.file_name);
        return {
          running: `Creating Frame “${name}”`,
          done: `Create Frame “${name}”`,
        };
      }
      if (
        toolName === "edit_interactive_content_file" &&
        isString(inputs.description)
      ) {
        const d = truncateQuery(inputs.description);
        return { running: `Editing Frame: ${d}`, done: `Edit Frame: ${d}` };
      }
      if (
        toolName === "rename_interactive_content_file" &&
        isString(inputs.new_file_name)
      ) {
        const name = truncateQuery(inputs.new_file_name);
        return {
          running: `Renaming Frame to “${name}”`,
          done: `Rename Frame to “${name}”`,
        };
      }
      return null;

    case "skill_management":
      if (toolName === "enable_skill" && isString(inputs.skillName)) {
        const name = truncateQuery(inputs.skillName);
        return {
          running: `Enabling skill “${name}”`,
          done: `Enable skill “${name}”`,
        };
      }
      return null;

    case "ask_user_question":
      if (toolName === "ask_user_question" && isString(inputs.question)) {
        const q = truncateQuery(inputs.question);
        return {
          running: `Asking: “${q}”`,
          done: `Ask: “${q}”`,
        };
      }
      return null;

    // All other servers: no dynamic labels.
    case "agent_sidekick_agent_state":
    case "agent_sidekick_context":
    case "agent_memory":
    case "agent_router":
    case "ashby":
    case "databricks":
    case "fathom":
    case "freshservice":
    case "gong":
    case "hubspot":
    case "include_data":
    case "slideshow":
    case "luma":
    case "missing_action_catcher":
    case "monday":
    case "openai_usage":
    case "primitive_types_debugger":
    case "productboard":
    case "common_utilities":
    case "jit_testing":
    case "run_dust_app":
    case "salesloft":
    case "skill_authoring":
    case "slab":
    case "snowflake":
    case "sound_studio":
    case "speech_generator":
    case "statuspage":
    case "toolsets":
    case "ukg_ready":
    case "user_mentions":
    case "val_town":
    case "vanta":
    case "front":
    case "schedules_management":
    case "poke":
    default:
      return null;
  }
}

function getStaticToolDisplayLabelsForServerName(
  serverName: string,
  toolName: string
): ToolDisplayLabels | null {
  const normalizedServerName = slugify(serverName);

  return (
    INTERNAL_TOOL_DISPLAY_LABELS_BY_SERVER[normalizedServerName]?.[toolName] ??
    DEFAULT_REMOTE_TOOL_DISPLAY_LABELS_BY_SERVER[normalizedServerName]?.[
      toolName
    ] ??
    null
  );
}

function getServerNameCandidates(serverName: string): string[] {
  const lastNestedSeparatorIndex = serverName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (lastNestedSeparatorIndex === -1) {
    return [serverName];
  }

  return [
    serverName,
    serverName.slice(lastNestedSeparatorIndex + TOOL_NAME_SEPARATOR.length),
  ];
}

export function getToolNameFromFunctionCallName(functionCallName: string) {
  return functionCallName.split(TOOL_NAME_SEPARATOR).at(-1) ?? functionCallName;
}

export function getToolDisplayLabels({
  internalMCPServerName,
  mcpServerName,
  toolName,
  inputs,
}: {
  internalMCPServerName?: InternalMCPServerNameType | null;
  mcpServerName?: string | null;
  toolName: string;
  inputs: Record<string, unknown>;
}): ToolDisplayLabels | null {
  if (internalMCPServerName) {
    const dynamicLabels = getDynamicToolDisplayLabels({
      internalMCPServerName,
      toolName,
      inputs,
    });
    if (dynamicLabels) {
      return dynamicLabels;
    }

    return getStaticToolDisplayLabelsForServerName(
      internalMCPServerName,
      toolName
    );
  }

  if (mcpServerName) {
    return getStaticToolDisplayLabelsForServerName(mcpServerName, toolName);
  }

  return null;
}

export function getStaticToolDisplayLabelsFromFunctionCallName(
  functionCallName: string
): ToolDisplayLabels | null {
  const parts = getToolCallNameParts(functionCallName);

  if (!parts) {
    return null;
  }

  for (const serverName of getServerNameCandidates(parts.serverName)) {
    const displayLabels = getStaticToolDisplayLabelsForServerName(
      serverName,
      parts.toolName
    );

    if (displayLabels) {
      return displayLabels;
    }
  }

  return null;
}

export function getToolCallDisplayLabel(
  functionCallName: string,
  context: "running" | "done" = "done"
): string {
  return (
    getStaticToolDisplayLabelsFromFunctionCallName(functionCallName)?.[
      context
    ] ?? asDisplayName(functionCallName)
  );
}
