/**
 * Converts Slack rich_text blocks to Markdown.
 *
 * Slack's rich_text blocks contain structured formatting (bold, italic, lists, quotes,
 * code blocks, etc.) that would otherwise be lost when using only the plain text fallback.
 *
 * Reference: https://docs.slack.dev/reference/block-kit/blocks/rich-text-block/
 */

// Types for Slack rich_text block structure.
// These are based on the Slack API documentation and may not cover all edge cases.

interface RichTextStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

interface RichTextElementText {
  type: "text";
  text: string;
  style?: RichTextStyle;
}

interface RichTextElementLink {
  type: "link";
  url: string;
  text?: string;
  style?: RichTextStyle;
}

interface RichTextElementEmoji {
  type: "emoji";
  name: string;
  unicode?: string;
}

interface RichTextElementUser {
  type: "user";
  user_id: string;
}

interface RichTextElementChannel {
  type: "channel";
  channel_id: string;
}

interface RichTextElementUsergroup {
  type: "usergroup";
  usergroup_id: string;
}

interface RichTextElementBroadcast {
  type: "broadcast";
  range: "channel" | "here" | "everyone";
}

type RichTextSectionElement =
  | RichTextElementText
  | RichTextElementLink
  | RichTextElementEmoji
  | RichTextElementUser
  | RichTextElementChannel
  | RichTextElementUsergroup
  | RichTextElementBroadcast;

interface RichTextSection {
  type: "rich_text_section";
  elements: RichTextSectionElement[];
}

interface RichTextList {
  type: "rich_text_list";
  style: "bullet" | "ordered";
  elements: RichTextSection[];
  indent?: number;
  border?: number;
}

interface RichTextQuote {
  type: "rich_text_quote";
  elements: RichTextSectionElement[];
}

interface RichTextPreformatted {
  type: "rich_text_preformatted";
  elements: RichTextSectionElement[];
  border?: number;
}

type RichTextBlockElement =
  | RichTextSection
  | RichTextList
  | RichTextQuote
  | RichTextPreformatted;

interface RichTextBlock {
  type: "rich_text";
  block_id?: string;
  elements: RichTextBlockElement[];
}

// Generic block type to filter rich_text blocks from the array.
interface GenericBlock {
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Applies inline formatting (bold, italic, strike, code) to text.
 */
function applyStyle(text: string, style?: RichTextStyle): string {
  if (!style || !text) {
    return text;
  }

  let result = text;

  // Apply code first (innermost), then other styles.
  if (style.code) {
    result = `\`${result}\``;
  }
  if (style.bold) {
    result = `**${result}**`;
  }
  if (style.italic) {
    result = `_${result}_`;
  }
  if (style.strike) {
    result = `~~${result}~~`;
  }

  return result;
}

/**
 * Formats a single rich text element (text, link, emoji, etc.) to markdown.
 */
function formatElement(element: RichTextSectionElement): string {
  switch (element.type) {
    case "text":
      return applyStyle(element.text, element.style);

    case "link": {
      const linkText = element.text || element.url;
      const styledText = applyStyle(linkText, element.style);
      // If text equals URL or no text, just use URL. Otherwise, use markdown link.
      if (!element.text || element.text === element.url) {
        return element.url;
      }
      return `[${styledText}](${element.url})`;
    }

    case "emoji":
      // Use unicode if available, otherwise use :name: format.
      return element.unicode
        ? String.fromCodePoint(
            ...element.unicode.split("-").map((hex) => parseInt(hex, 16))
          )
        : `:${element.name}:`;

    case "user":
      return `<@${element.user_id}>`;

    case "channel":
      return `<#${element.channel_id}>`;

    case "usergroup":
      return `<!subteam^${element.usergroup_id}>`;

    case "broadcast":
      return `@${element.range}`;

    default:
      return "";
  }
}

/**
 * Formats a rich_text_section to markdown (inline text with formatting).
 */
function formatSection(section: RichTextSection): string {
  return section.elements.map(formatElement).join("");
}

/**
 * Formats a rich_text_list to markdown (bullet or ordered list).
 */
function formatList(list: RichTextList): string {
  const indent = "  ".repeat(list.indent ?? 0);

  return list.elements
    .map((item, index) => {
      const content = formatSection(item);
      const prefix = list.style === "ordered" ? `${index + 1}.` : "-";
      return `${indent}${prefix} ${content}`;
    })
    .join("\n");
}

/**
 * Formats a rich_text_quote to markdown blockquote.
 */
function formatQuote(quote: RichTextQuote): string {
  const content = quote.elements.map(formatElement).join("");
  // Split by newlines and prefix each line with >.
  return content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * Formats a rich_text_preformatted to markdown code block.
 */
function formatPreformatted(preformatted: RichTextPreformatted): string {
  // For preformatted, we don't apply styling - just extract raw text.
  const content = preformatted.elements
    .map((el) => {
      if (el.type === "text") {
        return el.text;
      }
      if (el.type === "link") {
        return el.text || el.url;
      }
      return formatElement(el);
    })
    .join("");

  return `\`\`\`\n${content}\n\`\`\``;
}

/**
 * Formats a rich text block element (section, list, quote, or preformatted).
 */
function formatBlockElement(element: RichTextBlockElement): string {
  switch (element.type) {
    case "rich_text_section":
      return formatSection(element);
    case "rich_text_list":
      return formatList(element);
    case "rich_text_quote":
      return formatQuote(element);
    case "rich_text_preformatted":
      return formatPreformatted(element);
    default:
      return "";
  }
}

/**
 * Converts an array of Slack blocks to markdown.
 * Only processes rich_text blocks; other block types are ignored.
 *
 * @param blocks - Array of Slack blocks (may include various block types)
 * @returns Markdown string if rich_text blocks were found, null otherwise
 */
export function blocksToMarkdown(
  blocks: GenericBlock[] | undefined
): string | null {
  if (!blocks || blocks.length === 0) {
    return null;
  }

  const richTextBlocks = blocks.filter(
    (block): block is RichTextBlock =>
      block.type !== undefined && block.type === "rich_text"
  );

  if (richTextBlocks.length === 0) {
    return null;
  }

  const markdown = richTextBlocks
    .map((block) => block.elements.map(formatBlockElement).join("\n"))
    .join("\n\n");

  return markdown || null;
}
