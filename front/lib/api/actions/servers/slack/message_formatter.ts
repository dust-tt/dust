// Reconstructs readable text from a Slack message: app/bot messages (Datadog, Zendesk, ...)
// often have an empty top-level `text` and carry their content in `blocks`/`attachments`.
// Blocks are validated with zod; mrkdwn cleanup is delegated to `slack_mrkdwn.ts`.
import { slackMrkdwnToText } from "@app/lib/api/actions/servers/slack/slack_mrkdwn";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

const TextObjectSchema = z.object({ text: z.string() });

// Interactive elements (buttons in `actions` blocks or a section `accessory`): a `text`
// object and an optional url. Other element kinds (datepicker, select) leave these unset.
const InteractiveElementSchema = z.object({
  text: TextObjectSchema.optional(),
  url: z.string().optional(),
});

// Context elements are text objects (text at element level) or images (alt_text).
const ContextElementSchema = z.object({
  text: z.string().optional(),
  alt_text: z.string().optional(),
});

const HeaderBlockSchema = z.object({
  type: z.literal("header"),
  text: TextObjectSchema,
});

const SectionBlockSchema = z.object({
  type: z.literal("section"),
  text: TextObjectSchema.optional(),
  fields: z.array(TextObjectSchema).optional(),
  accessory: InteractiveElementSchema.optional(),
});

const ContextBlockSchema = z.object({
  type: z.literal("context"),
  elements: z.array(ContextElementSchema).optional(),
});

const ActionsBlockSchema = z.object({
  type: z.literal("actions"),
  elements: z.array(InteractiveElementSchema).optional(),
});

const ImageBlockSchema = z.object({
  type: z.literal("image"),
  title: TextObjectSchema.optional(),
  alt_text: z.string().optional(),
});

type RichTextElement = {
  type?: string;
  text?: string;
  url?: string;
  user_id?: string;
  channel_id?: string;
  usergroup_id?: string;
  name?: string;
  range?: string;
  fallback?: string;
  elements?: RichTextElement[];
};

const RichTextElementSchema: z.ZodType<RichTextElement> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
    user_id: z.string().optional(),
    channel_id: z.string().optional(),
    usergroup_id: z.string().optional(),
    name: z.string().optional(),
    range: z.string().optional(),
    fallback: z.string().optional(),
    elements: z.array(RichTextElementSchema).optional(),
  })
);

const RichTextBlockSchema = z.object({
  type: z.literal("rich_text"),
  elements: z.array(RichTextElementSchema).optional(),
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

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function renderRichTextLeaf(element: RichTextElement): string {
  switch (element.type) {
    case "text":
      return element.text ?? "";

    case "link":
      return element.text
        ? `${element.text} (${element.url ?? ""})`
        : (element.url ?? "");

    case "user":
      return element.user_id ? `@${element.user_id}` : "";

    case "usergroup":
      return element.usergroup_id ? `@${element.usergroup_id}` : "";

    case "channel":
      return element.channel_id ? `#${element.channel_id}` : "";

    case "emoji":
      return element.name ? `:${element.name}:` : "";

    case "broadcast":
      return element.range ? `@${element.range}` : "";

    case "date":
      return element.fallback ?? "";

    default:
      // Unknown leaf type (e.g. `color`): fall back to any `text` it might carry.
      return element.text ?? "";
  }
}

function renderRichTextSection(section: RichTextElement): string[] {
  const elements = section.elements ?? [];

  // Lists nest one rich_text_section per item.
  if (section.type === "rich_text_list") {
    return elements
      .flatMap((item) => renderRichTextSection(item))
      .filter((line) => line.length > 0)
      .map((line) => `- ${line}`);
  }

  const joined = elements
    .map((element) => renderRichTextLeaf(element))
    .join("");

  if (!joined) {
    return [];
  }

  if (section.type === "rich_text_quote") {
    return [`> ${joined}`];
  }

  return [joined];
}

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
      if (block.accessory) {
        const label = block.accessory.text?.text;
        const url = block.accessory.url;
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
        const text = element.text ?? element.alt_text;
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
        const label = element.text?.text;
        const url = element.url;
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
