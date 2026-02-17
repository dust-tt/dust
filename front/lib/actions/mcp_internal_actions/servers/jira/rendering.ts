import { jsonToMarkdown } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import { isStringArray } from "@app/types/shared/utils/general";
import { format } from "date-fns";

import type { ADFContentNode, JiraComment, JiraIssue } from "./types";
import { isADFDocument, JiraCommentsListSchema } from "./types";

function formatDateTime(dateString: string): string {
  return format(new Date(dateString), "yyyy-MM-dd HH:mm");
}

const SKIPPED_FIELDS = new Set(["summary", "description", "comment"]);
const DATETIME_FIELDS = new Set(["created", "updated"]);
const PRIORITY_FIELD_ORDER = [
  "project",
  "issuetype",
  "status",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "duedate",
  "parent",
  "created",
  "updated",
];

function formatFieldName(fieldName: string): string {
  const mappings: Record<string, string> = {
    issuetype: "Type",
    duedate: "Due Date",
  };
  if (fieldName in mappings) {
    return mappings[fieldName];
  }
  if (fieldName.startsWith("customfield_")) {
    return fieldName.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
  }
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function renderIssueLink(link: object): string | null {
  if (!("type" in link) || !("outwardIssue" in link || "inwardIssue" in link)) {
    return null;
  }

  const outward = "outwardIssue" in link ? link.outwardIssue : null;
  const inward = "inwardIssue" in link ? link.inwardIssue : null;
  const linkedIssue = outward ?? inward;

  if (
    typeof linkedIssue !== "object" ||
    linkedIssue === null ||
    !("key" in linkedIssue)
  ) {
    return null;
  }

  const issueKey = typeof linkedIssue.key === "string" ? linkedIssue.key : null;
  if (!issueKey) {
    return null;
  }

  const type =
    typeof link.type === "object" && link.type !== null ? link.type : null;
  if (!type) {
    return issueKey;
  }

  const relationship = outward
    ? "outward" in type && typeof type.outward === "string"
      ? type.outward
      : null
    : "inward" in type && typeof type.inward === "string"
      ? type.inward
      : null;

  return relationship ? `${relationship} ${issueKey}` : issueKey;
}

function renderObjectValue(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }

  if ("type" in obj && ("outwardIssue" in obj || "inwardIssue" in obj)) {
    return renderIssueLink(obj);
  }

  if ("name" in obj && typeof obj.name === "string") {
    return obj.name;
  }
  if ("displayName" in obj && typeof obj.displayName === "string") {
    return obj.displayName;
  }
  if ("accountId" in obj && typeof obj.accountId === "string") {
    return obj.accountId;
  }
  if ("key" in obj && typeof obj.key === "string") {
    return obj.key;
  }
  if ("value" in obj && typeof obj.value === "string") {
    return obj.value;
  }
  if ("id" in obj && typeof obj.id === "string") {
    return obj.id;
  }

  return null;
}

function renderFieldValue(value: unknown, isDateTime: boolean): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    if (value.trim() === "") {
      return null;
    }
    return isDateTime ? formatDateTime(value) : value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (isStringArray(value)) {
    return value.length > 0 ? value.join(", ") : null;
  }

  if (Array.isArray(value)) {
    const rendered = value
      .map((item) => renderObjectValue(item))
      .filter((item): item is string => item !== null);
    return rendered.length > 0 ? rendered.join(", ") : null;
  }

  if (typeof value === "object") {
    return renderObjectValue(value);
  }

  return null;
}

function extractEmbeddedComments(issue: JiraIssue): JiraComment[] {
  const fields = issue.fields as Record<string, unknown> | undefined;
  const commentField = fields?.["comment"];

  const parsed = JiraCommentsListSchema.safeParse(commentField);
  return parsed.success ? parsed.data.comments : [];
}

export function renderIssueWithEmbeddedComments(issue: JiraIssue): string {
  return renderIssue(issue, extractEmbeddedComments(issue));
}

export function renderIssue(issue: JiraIssue, comments: JiraComment[]): string {
  const lines: string[] = [];
  const fields = issue.fields ?? {};

  const summary =
    typeof fields.summary === "string" ? fields.summary : "No summary";
  lines.push(`# ${issue.key}: ${summary}`);
  lines.push("");

  if (issue.browseUrl) {
    lines.push(`**URL:** ${issue.browseUrl}`);
  }

  const fieldEntries = Object.entries(fields).filter(
    ([key]) => !SKIPPED_FIELDS.has(key)
  );
  const priorityEntries = fieldEntries.filter(([key]) =>
    PRIORITY_FIELD_ORDER.includes(key)
  );
  const remainingEntries = fieldEntries.filter(
    ([key]) => !PRIORITY_FIELD_ORDER.includes(key)
  );

  priorityEntries.sort(
    (a, b) =>
      PRIORITY_FIELD_ORDER.indexOf(a[0]) - PRIORITY_FIELD_ORDER.indexOf(b[0])
  );
  remainingEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const complexFields: Array<[string, unknown]> = [];

  for (const [name, value] of [...priorityEntries, ...remainingEntries]) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      if (isADFDocument(value)) {
        complexFields.push([name, value]);
        continue;
      }
    }

    const rendered = renderFieldValue(value, DATETIME_FIELDS.has(name));
    if (rendered !== null) {
      lines.push(`**${formatFieldName(name)}:** ${rendered}`);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      complexFields.push([name, value]);
    }
  }

  lines.push("");

  if (fields.description) {
    lines.push("## Description");
    lines.push("");
    lines.push(renderADFToMarkdown(fields.description));
    lines.push("");
  }

  for (const [name, value] of complexFields) {
    lines.push(`## ${formatFieldName(name)}`);
    lines.push("");
    if (typeof value === "object" && value !== null && isADFDocument(value)) {
      lines.push(renderADFToMarkdown(value));
    } else {
      lines.push(jsonToMarkdown(value));
    }
    lines.push("");
  }

  if (comments.length > 0) {
    lines.push("## Comments");
    lines.push("");

    for (const comment of comments) {
      const authorName =
        comment.author?.displayName ?? comment.author?.accountId ?? "Unknown";
      const date = comment.created
        ? formatDateTime(comment.created)
        : "Unknown date";

      lines.push(`### ${authorName} - Created on ${date}`);
      lines.push("");
      lines.push(renderADFToMarkdown(comment.body));
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Converts Atlassian Document Format (ADF) to Markdown.
 * ADF is a JSON-based document format used by Jira and Confluence.
 */
export function renderADFToMarkdown(
  adf: { content?: ADFContentNode[] } | null | undefined
): string {
  if (!adf || !adf.content) {
    return "";
  }

  return adf.content.map((node) => renderADFContentNode(node)).join("\n\n");
}

function renderADFContentNode(node: ADFContentNode): string {
  switch (node.type) {
    case "text":
      return renderTextNode(node);

    case "paragraph":
      return renderChildren(node.content);

    case "heading": {
      const level = Number(node.attrs?.level) || 1;
      const prefix = "#".repeat(Math.min(level + 2, 6));
      return `${prefix} ${renderChildren(node.content)}`;
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item: ADFContentNode) => renderADFContentNode(item))
        .join("\n");

    case "orderedList":
      return (node.content ?? [])
        .map((item: ADFContentNode, index: number) => {
          const itemContent = (item.content ?? [])
            .map((child: ADFContentNode) => renderADFContentNode(child))
            .join(" ");
          return `${index + 1}. ${itemContent}`;
        })
        .join("\n");

    case "listItem": {
      const content = (node.content ?? [])
        .map((child: ADFContentNode) => renderADFContentNode(child))
        .join(" ");
      return `- ${content}`;
    }

    case "blockquote":
      return renderChildren(node.content)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");

    case "codeBlock": {
      const language = String(node.attrs?.language ?? "");
      const code = (node.content ?? [])
        .map((textNode: ADFContentNode) => String(textNode.text ?? ""))
        .join("");
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }

    case "rule":
      return "---";

    case "hardBreak":
      return "\n";

    case "panel": {
      const panelType = String(node.attrs?.panelType ?? "info");
      return `> **${panelType.toUpperCase()}:** ${renderChildren(node.content)}`;
    }

    case "table":
      return renderTable(node);

    case "mediaSingle":
    case "media":
      return "[Media attachment]";

    case "mention":
      return String(node.attrs?.text ?? "@mention");

    case "emoji":
      return String(node.attrs?.shortName ?? "");

    case "inlineCard":
    case "blockCard": {
      const url = String(node.attrs?.url ?? "");
      return url ? `[Link](${url})` : "[Link]";
    }

    default:
      // Keep track of unknown ADF nodes to see if there are new fields we need to handle
      logger.info(
        {
          adfNodeType: node.type,
          hasContent: !!node.content,
          hasAttrs: !!node.attrs,
          attrsKeys: node.attrs ? Object.keys(node.attrs) : [],
        },
        "[Jira MCP] Unknown ADF node type handled by catch-all"
      );
      if (node.content) {
        return renderChildren(node.content);
      }
      return "";
  }
}

function renderTextNode(node: ADFContentNode): string {
  let text = node.text ?? "";

  if (node.marks) {
    for (const mark of node.marks) {
      switch (mark.type) {
        case "strong":
          text = `**${text}**`;
          break;
        case "em":
          text = `*${text}*`;
          break;
        case "code":
          text = `\`${text}\``;
          break;
        case "strike":
          text = `~~${text}~~`;
          break;
        case "link": {
          const href = String(mark.attrs?.href ?? "");
          text = href ? `[${text}](${href})` : text;
          break;
        }
        case "underline":
          text = `_${text}_`;
          break;
        case "subsup": {
          const subSupType = String(mark.attrs?.type ?? "");
          if (subSupType === "sub") {
            text = `~${text}~`;
          } else if (subSupType === "sup") {
            text = `^${text}^`;
          }
          break;
        }
      }
    }
  }

  return text;
}

function renderChildren(content: ADFContentNode[] | undefined): string {
  if (!content) {
    return "";
  }
  return content.map((child) => renderADFContentNode(child)).join("");
}

function renderTable(node: ADFContentNode): string {
  if (!node.content) {
    return "";
  }

  const rows: string[][] = [];

  for (const row of node.content) {
    if (row.type === "tableRow" && row.content) {
      const cells: string[] = [];
      for (const cell of row.content) {
        const cellContent = renderChildren(cell.content);
        cells.push(cellContent.replace(/\|/g, "\\|").replace(/\n/g, " "));
      }
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return "";
  }

  const lines: string[] = [];
  const columnCount = Math.max(...rows.map((r) => r.length));

  const headerRow = rows[0] ?? [];
  lines.push(`| ${headerRow.join(" | ")} |`);

  const separator = Array(columnCount).fill("---").join(" | ");
  lines.push(`| ${separator} |`);

  for (const row of rows.slice(1)) {
    while (row.length < columnCount) {
      row.push("");
    }
    lines.push(`| ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}
