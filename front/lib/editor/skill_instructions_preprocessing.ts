import { unescape } from "html-escaper";

const ZWS = "\u200B";

/**
 * Preprocess markdown before loading it into the TipTap editor.
 */
export function preprocessMarkdownForEditor(markdown: string): string {
  return markdown.replace(/<(?!\/?knowledge[\s>/])(\/?\w)/g, `<${ZWS}$1`);
}

/**
 * Normalize markdown serialized out of the TipTap editor before saving.
 */
export function postProcessMarkdown(markdown: string): string {
  return unescape(markdown).replace(new RegExp(ZWS, "g"), "");
}
