// Reconstructs readable text from a Slack message: app/bot messages (Datadog, Zendesk, ...)
// often have an empty top-level `text` and put their content in `blocks[]`/`attachments[]`.
// Block Kit is loosely typed in the SDK (the `header` block is even missing), so we read
// `unknown` and narrow with type guards. mrkdwn cleanup is delegated to `slack_mrkdwn.ts`.
import { slackMrkdwnToText } from "@app/lib/api/actions/servers/slack/slack_mrkdwn";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

// Reads the `.text` string out of a Slack text object (e.g. { type: "mrkdwn", text }).
function readTextObject(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return asString(value.text);
}

// Collapses whitespace/newlines into single spaces (for field values shown on one line).
function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Renders a leaf element of a rich_text section.
function renderRichTextLeaf(element: Record<string, unknown>): string {
  const type = asString(element.type);
  switch (type) {
    case "text":
      return asString(element.text) ?? "";
    case "link": {
      const url = asString(element.url) ?? "";
      const label = asString(element.text);
      return label ? `${label} (${url})` : url;
    }
    case "user": {
      const userId = asString(element.user_id);
      return userId ? `@${userId}` : "";
    }
    case "usergroup": {
      const groupId = asString(element.usergroup_id);
      return groupId ? `@${groupId}` : "";
    }
    case "channel": {
      const channelId = asString(element.channel_id);
      return channelId ? `#${channelId}` : "";
    }
    case "emoji": {
      const name = asString(element.name);
      return name ? `:${name}:` : "";
    }
    case "broadcast": {
      const range = asString(element.range);
      return range ? `@${range}` : "";
    }
    case "date":
      // `date` carries a fallback string suitable for display.
      return asString(element.fallback) ?? "";
    default:
      // Unknown leaf type (e.g. `color`): fall back to any `text` it might carry.
      return asString(element.text) ?? "";
  }
}

// Renders a rich_text sub-section (rich_text_section, rich_text_list, rich_text_quote,
// rich_text_preformatted) into one or more lines.
function renderRichTextSection(section: unknown): string[] {
  if (!isRecord(section)) {
    return [];
  }
  const type = asString(section.type);
  const elements = asArray(section.elements) ?? [];

  // Lists nest one rich_text_section per item.
  if (type === "rich_text_list") {
    return elements
      .flatMap((item) => renderRichTextSection(item))
      .filter((line) => line.length > 0)
      .map((line) => `- ${line}`);
  }

  const joined = elements
    .map((element) => (isRecord(element) ? renderRichTextLeaf(element) : ""))
    .join("");

  if (!joined) {
    return [];
  }
  if (type === "rich_text_quote") {
    return [`> ${joined}`];
  }
  return [joined];
}

// Extracts readable lines from a single Block Kit block.
function extractLinesFromBlock(block: unknown): string[] {
  if (!isRecord(block)) {
    return [];
  }
  const type = asString(block.type);

  switch (type) {
    case "header": {
      const text = readTextObject(block.text);
      return text ? [text] : [];
    }

    case "section": {
      const lines: string[] = [];
      const main = readTextObject(block.text);
      if (main) {
        lines.push(main);
      }
      // `fields` is an array of text objects rendered in a compact 2-column layout.
      const fields = asArray(block.fields);
      if (fields) {
        for (const field of fields) {
          const fieldText = readTextObject(field);
          if (fieldText) {
            lines.push(toSingleLine(fieldText));
          }
        }
      }
      // A section can carry an accessory (often a button with a label and url).
      if (isRecord(block.accessory)) {
        const label = readTextObject(block.accessory.text);
        const url = asString(block.accessory.url);
        if (label && url) {
          lines.push(`${label} (${url})`);
        } else if (label) {
          lines.push(label);
        }
      }
      return lines;
    }

    case "context": {
      // In a context block, `elements` are text objects (text at element level) or image
      // elements (alt_text). They render inline, so we join them on one line.
      const elements = asArray(block.elements) ?? [];
      const parts: string[] = [];
      for (const element of elements) {
        if (!isRecord(element)) {
          continue;
        }
        const text = asString(element.text) ?? asString(element.alt_text);
        if (text) {
          parts.push(text);
        }
      }
      const joined = toSingleLine(parts.join(" "));
      return joined ? [joined] : [];
    }

    case "actions": {
      const elements = asArray(block.elements) ?? [];
      const lines: string[] = [];
      for (const element of elements) {
        if (!isRecord(element)) {
          continue;
        }
        const label = readTextObject(element.text);
        const url = asString(element.url);
        if (label && url) {
          lines.push(`${label} (${url})`);
        } else if (label) {
          lines.push(label);
        } else if (url) {
          lines.push(url);
        }
      }
      return lines;
    }

    case "image": {
      const lines: string[] = [];
      const title = readTextObject(block.title);
      if (title) {
        lines.push(title);
      }
      const alt = asString(block.alt_text);
      if (alt) {
        lines.push(alt);
      }
      return lines;
    }

    case "rich_text": {
      const elements = asArray(block.elements) ?? [];
      return elements.flatMap((section) => renderRichTextSection(section));
    }

    case "divider":
      return [];

    default: {
      // Best-effort fallback for unknown block types that still carry a text object.
      const text = readTextObject(block.text);
      return text ? [text] : [];
    }
  }
}

// Extracts readable lines from a single message attachment.
function extractLinesFromAttachment(attachment: unknown): string[] {
  if (!isRecord(attachment)) {
    return [];
  }
  const lines: string[] = [];

  const pushIfPresent = (value: unknown) => {
    const text = asString(value);
    if (text && text.trim()) {
      lines.push(text);
    }
  };

  pushIfPresent(attachment.pretext);
  pushIfPresent(attachment.title);
  pushIfPresent(attachment.text);
  // `fallback` is the plaintext alternative to the rich content; only use it when there is
  // no `text` to avoid duplicating the same content twice.
  if (!asString(attachment.text)) {
    pushIfPresent(attachment.fallback);
  }

  const fields = asArray(attachment.fields);
  if (fields) {
    for (const field of fields) {
      if (!isRecord(field)) {
        continue;
      }
      const title = asString(field.title)?.trim();
      const value = asString(field.value)?.trim();
      if (title && value) {
        lines.push(toSingleLine(`${title}: ${value}`));
      } else if (title) {
        lines.push(title);
      } else if (value) {
        lines.push(value);
      }
    }
  }

  return lines;
}

export interface FormattableSlackMessage {
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  files?: unknown[];
}

// Reconstructs a readable plain-text/markdown representation of a Slack message, pulling
// content out of blocks and attachments when the top-level `text` is empty or
// insufficient. Deduplicates exact-duplicate lines (Slack often repeats content across
// `text`, `blocks`, and attachment `fallback`).
export function formatSlackMessageForLLM(
  message: FormattableSlackMessage
): string {
  // Phase 1 — extraction: collect raw lines (still containing Slack mrkdwn tokens) from
  // every source. Extractors only locate text; they do not normalize it.
  const rawLines: string[] = [];

  const text = asString(message.text);
  if (text) {
    rawLines.push(text);
  }

  if (Array.isArray(message.blocks)) {
    for (const block of message.blocks) {
      rawLines.push(...extractLinesFromBlock(block));
    }
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      rawLines.push(...extractLinesFromAttachment(attachment));
    }
  }

  if (Array.isArray(message.files)) {
    for (const file of message.files) {
      if (!isRecord(file)) {
        continue;
      }
      const name = asString(file.name);
      const mimetype = asString(file.mimetype);
      if (name) {
        rawLines.push(
          `Attached file: ${name}${mimetype ? ` (${mimetype})` : ""}`
        );
      }
    }
  }

  // Phase 2 — normalization: split multi-line entries, clean Slack mrkdwn once per line,
  // trim, drop empties, then dedupe exact lines while preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const rawLine of rawLines.flatMap((line) => line.split("\n"))) {
    const line = slackMrkdwnToText(rawLine).trim();
    if (line.length > 0 && !seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }

  return deduped.join("\n");
}
