import { unescape } from "html-escaper";

const ZWS = "\u200B";
const SKILL_REFERENCE_TAG_REGEX = /<skill\s+[^>]*\s*\/>/g;
const SKILL_REFERENCE_TAG_PLACEHOLDER = "DUST_SKILL_REFERENCE_TAG_PLACEHOLDER_";

/**
 * Escape emphasis delimiters (_ and *) inside $$ ... $$ math blocks so
 * marked.js does not parse them as italic/bold markers.
 */
function escapeMathEmphasis(markdown: string): string {
  return markdown.replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
    block.replace(/(?<!\\)_/g, "\\_").replace(/(?<!\\)\*/g, "\\*"),
  );
}

/**
 * Preprocess markdown before loading it into the TipTap editor.
 */
export function preprocessMarkdownForEditor(markdown: string): string {
  return escapeMathEmphasis(
    markdown.replace(/<(?!\/?(knowledge|skill)[\s>/])(\/?\w)/g, `<${ZWS}$2`),
  );
}

/**
 * Normalize markdown serialized out of the TipTap editor before saving.
 */
export function postProcessMarkdown(markdown: string): string {
  const skillReferenceTags: string[] = [];
  const markdownWithProtectedSkillReferences = markdown.replace(
    SKILL_REFERENCE_TAG_REGEX,
    (tag) => {
      const index = skillReferenceTags.push(tag) - 1;
      return `${SKILL_REFERENCE_TAG_PLACEHOLDER}${index}`;
    },
  );

  const processedMarkdown = unescape(markdownWithProtectedSkillReferences)
    .replace(new RegExp(ZWS, "g"), "")
    .replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
      block.replace(/\\_/g, "_").replace(/\\\*/g, "*"),
    );

  return skillReferenceTags.reduce(
    (result, tag, index) =>
      result.replaceAll(`${SKILL_REFERENCE_TAG_PLACEHOLDER}${index}`, tag),
    processedMarkdown,
  );
}
