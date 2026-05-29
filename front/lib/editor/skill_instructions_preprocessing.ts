import { unescape } from "html-escaper";

const ZWS = "\u200B";

/**
 * Escape emphasis delimiters (_ and *) inside $$ ... $$ math blocks so
 * marked.js does not parse them as italic/bold markers.
 */
function escapeMathEmphasis(markdown: string): string {
  return markdown.replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
    block.replace(/(?<!\\)_/g, "\\_").replace(/(?<!\\)\*/g, "\\*")
  );
}

/**
 * Preprocess markdown before loading it into the TipTap editor.
 */
export function preprocessMarkdownForEditor(
  markdown: string,
  { enableSkillReferences = false }: { enableSkillReferences?: boolean } = {}
): string {
  const preservedTags = ["knowledge", "tool"];
  if (enableSkillReferences) {
    preservedTags.push("skill");
  }
  const preservedTagsPattern = preservedTags.join("|");

  return escapeMathEmphasis(
    markdown.replace(
      new RegExp(`<(?!(?:/?(?:${preservedTagsPattern}))[\\s>/])(/?\\w)`, "g"),
      `<${ZWS}$1`
    )
  );
}

/**
 * Normalize markdown serialized out of the TipTap editor before saving.
 */
export function postProcessMarkdown(markdown: string): string {
  return unescape(markdown)
    .replace(new RegExp(ZWS, "g"), "")
    .replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
      block.replace(/\\_/g, "_").replace(/\\\*/g, "*")
    );
}
