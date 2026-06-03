import { parseToolTag, TOOL_TAG_REGEX } from "@app/lib/tools/format";
import { unescape } from "html-escaper";

const ZWS = "\u200B";
const TOOL_TAG_PLACEHOLDER_PREFIX = "\uE000DUST_TOOL_TAG_";
const TOOL_TAG_PLACEHOLDER_SUFFIX = "\uE001";

/**
 * Escape emphasis delimiters (_ and *) inside $$ ... $$ math blocks so
 * marked.js does not parse them as italic/bold markers.
 */
function escapeMathEmphasis(markdown: string): string {
  return markdown.replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
    block.replace(/(?<!\\)_/g, "\\_").replace(/(?<!\\)\*/g, "\\*")
  );
}

function withPreservedToolTags(
  markdown: string,
  transform: (markdownWithToolPlaceholders: string) => string
): string {
  const toolTags: string[] = [];
  const markdownWithToolPlaceholders = markdown.replace(
    TOOL_TAG_REGEX,
    (tag) => {
      if (!parseToolTag(tag)) {
        return tag;
      }

      const placeholder = `${TOOL_TAG_PLACEHOLDER_PREFIX}${toolTags.length}${TOOL_TAG_PLACEHOLDER_SUFFIX}`;
      toolTags.push(tag);
      return placeholder;
    }
  );

  return transform(markdownWithToolPlaceholders).replace(
    new RegExp(
      `${TOOL_TAG_PLACEHOLDER_PREFIX}(\\d+)${TOOL_TAG_PLACEHOLDER_SUFFIX}`,
      "g"
    ),
    (_, index: string) => {
      const toolTag = toolTags[Number(index)];
      if (!toolTag) {
        throw new Error("Missing preserved tool tag placeholder.");
      }
      return toolTag;
    }
  );
}

/**
 * Preprocess markdown before loading it into the TipTap editor.
 */
export function preprocessMarkdownForEditor(
  markdown: string,
  { enableSkillReferences = false }: { enableSkillReferences?: boolean } = {}
): string {
  const preservedTags = ["knowledge"];
  if (enableSkillReferences) {
    preservedTags.push("skill", "unavailable_skill");
  }
  const preservedTagsPattern = preservedTags.join("|");
  const escapeUnsupportedTags = (markdownToProcess: string) =>
    escapeMathEmphasis(
      markdownToProcess.replace(
        new RegExp(`<(?!(?:/?(?:${preservedTagsPattern}))[\\s>/])(/?\\w)`, "g"),
        `<${ZWS}$1`
      )
    );

  return enableSkillReferences
    ? withPreservedToolTags(markdown, escapeUnsupportedTags)
    : escapeUnsupportedTags(markdown);
}

/**
 * Normalize markdown serialized out of the TipTap editor before saving.
 */
export function postProcessMarkdown(markdown: string): string {
  return withPreservedToolTags(markdown, (markdownWithToolPlaceholders) =>
    unescape(markdownWithToolPlaceholders)
      .replace(new RegExp(ZWS, "g"), "")
      .replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
        block.replace(/\\_/g, "_").replace(/\\\*/g, "*")
      )
  );
}
