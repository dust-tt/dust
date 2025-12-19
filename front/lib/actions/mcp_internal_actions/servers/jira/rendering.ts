import { format } from "date-fns";

import type { ADFContentNode, JiraComment, JiraIssue } from "./types";
import { JiraCommentsListSchema } from "./types";

function formatDateTime(dateString: string): string {
  return format(new Date(dateString), "yyyy-MM-dd HH:mm");
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
  const fields = issue.fields;

  lines.push(`# ${issue.key}: ${fields?.summary ?? "No summary"}`);
  lines.push("");

  if (issue.browseUrl) {
    lines.push(`**URL:** ${issue.browseUrl}`);
  }

  if (fields?.project?.key) {
    lines.push(`**Project:** ${fields.project.key}`);
  }

  if (fields?.issuetype?.name) {
    lines.push(`**Type:** ${fields.issuetype.name}`);
  }

  if (fields?.status?.name) {
    lines.push(`**Status:** ${fields.status.name}`);
  }

  if (fields?.priority?.name) {
    lines.push(`**Priority:** ${fields.priority.name}`);
  }

  if (fields?.assignee) {
    const assigneeName =
      fields.assignee.displayName ?? fields.assignee.accountId ?? "Unknown";
    lines.push(`**Assignee:** ${assigneeName}`);
  }

  if (fields?.reporter) {
    const reporterName =
      fields.reporter.displayName ?? fields.reporter.accountId ?? "Unknown";
    lines.push(`**Reporter:** ${reporterName}`);
  }

  if (fields?.labels && fields.labels.length > 0) {
    lines.push(`**Labels:** ${fields.labels.join(", ")}`);
  }

  if (fields?.duedate) {
    lines.push(`**Due Date:** ${fields.duedate}`);
  }

  if (fields?.parent?.key) {
    lines.push(`**Parent:** ${fields.parent.key}`);
  }

  if (fields?.created) {
    lines.push(`**Created:** ${formatDateTime(fields.created)}`);
  }

  if (fields?.updated) {
    lines.push(`**Updated:** ${formatDateTime(fields.updated)}`);
  }

  lines.push("");

  if (fields?.description) {
    lines.push("## Description");
    lines.push("");
    lines.push(renderADFToMarkdown(fields.description));
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
