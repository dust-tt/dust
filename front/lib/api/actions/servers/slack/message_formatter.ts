// Reconstructs readable text from a Slack message: app/bot messages (Datadog, Zendesk, ...)
// often have an empty top-level `text` and put their content in `blocks[]`/`attachments[]`.
// Block Kit is loosely typed in the SDK (the `header` block is even missing), so we read
// `unknown` and narrow with type guards. mrkdwn cleanup is delegated to `slack_mrkdwn.ts`.
import { slackMrkdwnToText } from "@app/lib/api/actions/servers/slack/slack_mrkdwn";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

// A Slack "text object", e.g. { type: "mrkdwn", text: "..." }. We only need `text`.
const TextObjectSchema = z.object({ text: z.string() });

const HeaderBlockSchema = z.object({
  type: z.literal("header"),
  text: TextObjectSchema,
});

const SectionBlockSchema = z.object({
  type: z.literal("section"),
  text: TextObjectSchema.optional(),
  fields: z.array(TextObjectSchema).optional(),
  accessory: z.unknown().optional(),
});

const ContextBlockSchema = z.object({
  type: z.literal("context"),
  elements: z.array(z.unknown()).optional(),
});

const ActionsBlockSchema = z.object({
  type: z.literal("actions"),
  elements: z.array(z.unknown()).optional(),
});

const ImageBlockSchema = z.object({
  type: z.literal("image"),
  title: TextObjectSchema.optional(),
  alt_text: z.string().optional(),
});

const RichTextBlockSchema = z.object({
  type: z.literal("rich_text"),
  elements: z.array(z.unknown()).optional(),
});

const DividerBlockSchema = z.object({
  type: z.literal("divider"),
});

const SlackBlockSchema = z.discriminatedUnion("type", [
  HeaderBlockSchema,
  SectionBlockSchema,
  ContextBlockSchema,
  ActionsBlockSchema,
  ImageBlockSchema,
  RichTextBlockSchema,
  DividerBlockSchema,
]);

type SlackBlock = z.infer<typeof SlackBlockSchema>;

// Attachments are the legacy message format; we read a handful of plain-text fields.
const AttachmentFieldSchema = z.object({
  title: z.string().optional(),
  value: z.string().optional(),
});

const AttachmentSchema = z.object({
  pretext: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  fallback: z.string().optional(),
  fields: z.array(AttachmentFieldSchema).optional(),
});

type SlackAttachment = z.infer<typeof AttachmentSchema>;

const FileSchema = z.object({
  name: z.string().optional(),
  mimetype: z.string().optional(),
});

const SlackMessageSchema = z.object({
  text: z.string().optional(),
  blocks: z.array(SlackBlockSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  files: z.array(FileSchema).optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

// Reads the `.text` string out of a Slack text object (e.g. { type: "mrkdwn", text }).
function readTextObject(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return isString(value.text) ? value.text : undefined;
}

// Collapses whitespace/newlines into single spaces (for field values shown on one line).
function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Renders a leaf element of a rich_text section.
function renderRichTextLeaf(element: Record<string, unknown>): string {
  const type = isString(element.type) ? element.type : undefined;
  switch (type) {
    case "text":
      return isString(element.text) ? element.text : "";
    case "link": {
      const url = isString(element.url) ? element.url : "";
      const label = isString(element.text) ? element.text : undefined;
      return label ? `${label} (${url})` : url;
    }
    case "user":
      return isString(element.user_id) ? `@${element.user_id}` : "";
    case "usergroup":
      return isString(element.usergroup_id) ? `@${element.usergroup_id}` : "";
    case "channel":
      return isString(element.channel_id) ? `#${element.channel_id}` : "";
    case "emoji":
      return isString(element.name) ? `:${element.name}:` : "";
    case "broadcast":
      return isString(element.range) ? `@${element.range}` : "";
    case "date":
      // `date` carries a fallback string suitable for display.
      return isString(element.fallback) ? element.fallback : "";
    default:
      // Unknown leaf type (e.g. `color`): fall back to any `text` it might carry.
      return isString(element.text) ? element.text : "";
  }
}

// Renders a rich_text sub-section (rich_text_section, rich_text_list, rich_text_quote,
// rich_text_preformatted) into one or more lines.
function renderRichTextSection(section: unknown): string[] {
  if (!isRecord(section)) {
    return [];
  }
  const type = isString(section.type) ? section.type : undefined;
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
function extractLinesFromBlock(block: SlackBlock): string[] {
  switch (block.type) {
    case "header": {
      const { text } = block.text;
      return text ? [text] : [];
    }

    case "section": {
      const lines: string[] = [];
      const main = block.text?.text;
      if (main) {
        lines.push(main);
      }
      const fields = block.fields;

      if (fields) {
        for (const field of fields) {
          if (field.text) {
            lines.push(toSingleLine(field.text));
          }
        }
      }
      // A section can carry an accessory (often a button with a label and url).
      if (isRecord(block.accessory)) {
        const label = readTextObject(block.accessory.text);
        const url = isString(block.accessory.url)
          ? block.accessory.url
          : undefined;
        if (label && url) {
          lines.push(`${label} (${url})`);
        } else if (label) {
          lines.push(label);
        }
      }
      return lines;
    }

    case "context": {
      const elements = block.elements ?? [];

      const parts: string[] = [];
      for (const element of elements) {
        if (!isRecord(element)) {
          continue;
        }
        let text: string | undefined;
        if (isString(element.text)) {
          text = element.text;
        } else if (isString(element.alt_text)) {
          text = element.alt_text;
        }
        if (text) {
          parts.push(text);
        }
      }
      const joined = toSingleLine(parts.join(" "));
      return joined ? [joined] : [];
    }

    case "actions": {
      const elements = block.elements ?? [];

      const lines: string[] = [];
      for (const element of elements) {
        if (!isRecord(element)) {
          continue;
        }
        const label = readTextObject(element.text);
        const url = isString(element.url) ? element.url : undefined;
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
      const title = block.title?.text;
      if (title) {
        lines.push(title);
      }
      const alt = block.alt_text;
      if (alt) {
        lines.push(alt);
      }
      return lines;
    }

    case "rich_text": {
      const elements = block.elements ?? [];
      return elements.flatMap((section) => renderRichTextSection(section));
    }

    case "divider":
      return [];

    default:
      return assertNever(block);
  }
}

// Extracts readable lines from a single message attachment.
function extractLinesFromAttachment(attachment: SlackAttachment): string[] {
  const lines: string[] = [];

  const pushIfPresent = (value: string | undefined) => {
    if (value && value.trim()) {
      lines.push(value);
    }
  };

  pushIfPresent(attachment.pretext);
  pushIfPresent(attachment.title);
  pushIfPresent(attachment.text);
  // `fallback` duplicates the rich content; only use it when there is no `text`.
  if (!attachment.text) {
    pushIfPresent(attachment.fallback);
  }

  for (const field of attachment.fields ?? []) {
    const title = field.title?.trim();
    const value = field.value?.trim();
    if (title && value) {
      lines.push(toSingleLine(`${title}: ${value}`));
    } else if (title) {
      lines.push(title);
    } else if (value) {
      lines.push(value);
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

export interface FormattedSlackMessage {
  text: string;
  blocks: string;
  attachments: string;
  files: string;
}

const EMPTY_SECTION = "(empty)";

// Cleans Slack mrkdwn in each line and joins them, or returns "(empty)" when there is none.
function renderSection(rawLines: string[]): string {
  const cleaned = rawLines
    .flatMap((line) => line.split("\n"))
    .map((line) => slackMrkdwnToText(line).trim())
    .filter((line) => line.length > 0);
  return cleaned.length > 0 ? cleaned.join("\n") : EMPTY_SECTION;
}

// Flattens a FormattedSlackMessage into a single labeled string for tools that emit text.
export function renderFormattedMessage(m: FormattedSlackMessage): string {
  return [
    `Text: ${m.text}`,
    `Blocks: ${m.blocks}`,
    `Attachments: ${m.attachments}`,
    `Files: ${m.files}`,
  ].join("\n\n");
}

// Reconstructs a Slack message as readable text grouped by source. App/bot messages often
// have an empty top-level `text` and carry their content in `blocks`/`attachments`.
export function formatSlackMessageForLLM(
  message: FormattableSlackMessage
): FormattedSlackMessage {
  const parsed = SlackMessageSchema.safeParse(message);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.format() },
      "Slack message failed schema validation"
    );
    const { text } = message;
    return {
      text: renderSection(text ? [text] : []),
      blocks: "(could not parse)",
      attachments: "(could not parse)",
      files: "(could not parse)",
    };
  }
  const { text, blocks, attachments, files } = parsed.data;

  const blockLines = (blocks ?? []).flatMap((block) =>
    extractLinesFromBlock(block)
  );
  const attachmentLines = (attachments ?? []).flatMap((attachment) =>
    extractLinesFromAttachment(attachment)
  );
  const fileLines = (files ?? []).flatMap((file) =>
    file.name
      ? [
          `Attached file: ${file.name}${file.mimetype ? ` (${file.mimetype})` : ""}`,
        ]
      : []
  );

  return {
    text: renderSection(text ? [text] : []),
    blocks: renderSection(blockLines),
    attachments: renderSection(attachmentLines),
    files: renderSection(fileLines),
  };
}
