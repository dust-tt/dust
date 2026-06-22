// Reconstructs a readable plain-text/markdown representation from a Slack message.
//
// Many app/bot messages (Datadog, Zendesk, PagerDuty, ...) ship an empty top-level
// `text` field and put the actual content in `blocks[]` (Block Kit) and/or
// `attachments[]`. Relying on `message.text` alone makes those messages look empty to
// LLMs. This formatter walks blocks and attachments to extract their textual content.
//
// It is intentionally read-only and best-effort. Slack's SDK does not provide complete
// types for Block Kit inside message responses (the generated `AssistantAppThreadBlock`
// type is flattened and even omits `header`), so we accept loosely typed input and narrow
// defensively with type guards rather than trusting the SDK types. The structure handled
// here matches the official Block Kit reference:
// https://docs.slack.dev/reference/block-kit/blocks

// Minimal type guards (avoids relying on the SDK's incomplete block types and avoids
// non-type-safe `as` casts per [GEN4]).
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

// Converts Slack mrkdwn to lightweight plain text: resolves links/mentions and strips
// bold/strikethrough markers so content reads cleanly for an LLM.
function cleanSlackMrkdwn(text: string): string {
  return (
    text
      // <https://url|label> -> label (https://url)
      .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)")
      // <https://url> -> https://url
      .replace(/<(https?:\/\/[^|>]+)>/g, "$1")
      // <mailto:foo@bar|label> -> label
      .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
      // <@U123|name> -> @name ; <@U123> -> @U123
      .replace(/<@[UW][A-Z0-9]+\|([^>]+)>/g, "@$1")
      .replace(/<@([UW][A-Z0-9]+)>/g, "@$1")
      // <#C123|name> -> #name ; <#C123> -> #C123
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
      .replace(/<#([A-Z0-9]+)>/g, "#$1")
      // <!subteam^S123|@group> -> @group ; <!here>/<!channel> -> @here/@channel
      .replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "$1")
      .replace(/<!(here|channel|everyone)>/g, "@$1")
      // *bold* -> bold ; ~strike~ -> strike
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/~([^~\n]+)~/g, "$1")
  );
}

// Collapses internal newlines/whitespace into single spaces (used for field values that
// Slack renders on a single visual line, e.g. "*Status:*\nTriggered").
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
      return text ? [cleanSlackMrkdwn(text)] : [];
    }

    case "section": {
      const lines: string[] = [];
      const main = readTextObject(block.text);
      if (main) {
        lines.push(cleanSlackMrkdwn(main));
      }
      // `fields` is an array of text objects rendered in a compact 2-column layout.
      const fields = asArray(block.fields);
      if (fields) {
        for (const field of fields) {
          const fieldText = readTextObject(field);
          if (fieldText) {
            lines.push(toSingleLine(cleanSlackMrkdwn(fieldText)));
          }
        }
      }
      // A section can carry an accessory (often a button with a label and url).
      if (isRecord(block.accessory)) {
        const label = readTextObject(block.accessory.text);
        const url = asString(block.accessory.url);
        if (label && url) {
          lines.push(`${cleanSlackMrkdwn(label)} (${url})`);
        } else if (label) {
          lines.push(cleanSlackMrkdwn(label));
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
      return joined ? [cleanSlackMrkdwn(joined)] : [];
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
          lines.push(`${cleanSlackMrkdwn(label)} (${url})`);
        } else if (label) {
          lines.push(cleanSlackMrkdwn(label));
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
        lines.push(cleanSlackMrkdwn(title));
      }
      const alt = asString(block.alt_text);
      if (alt) {
        lines.push(cleanSlackMrkdwn(alt));
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
      return text ? [cleanSlackMrkdwn(text)] : [];
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
      lines.push(cleanSlackMrkdwn(text));
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
        lines.push(toSingleLine(cleanSlackMrkdwn(`${title}: ${value}`)));
      } else if (title) {
        lines.push(cleanSlackMrkdwn(title));
      } else if (value) {
        lines.push(cleanSlackMrkdwn(value));
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
  const lines: string[] = [];

  const text = asString(message.text)?.trim();
  if (text) {
    lines.push(cleanSlackMrkdwn(text));
  }

  if (Array.isArray(message.blocks)) {
    for (const block of message.blocks) {
      lines.push(...extractLinesFromBlock(block));
    }
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      lines.push(...extractLinesFromAttachment(attachment));
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
        lines.push(`Attached file: ${name}${mimetype ? ` (${mimetype})` : ""}`);
      }
    }
  }

  // Split multi-line entries, trim, drop empties, then dedupe exact lines while preserving
  // order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const rawLine of lines.flatMap((line) => line.split("\n"))) {
    const line = rawLine.trim();
    if (line.length > 0 && !seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }

  return deduped.join("\n");
}
