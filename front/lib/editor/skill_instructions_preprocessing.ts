const ZWS = "\u200B";

/**
 * Prepare markdown for conversion to HTML or for loading into the TipTap editor.
 *
 * Inserts a zero-width space after every `<` that is not already ZWS-prefixed.
 * This prevents marked (used by TipTap's MarkdownManager and the browser editor)
 * from treating XML-like tags (e.g. <instructions>) as raw HTML tokens and dropping them.
 */
export function preprocessMarkdown(markdown: string): string {
  return markdown.replace(new RegExp(`<(?!${ZWS})`, "g"), `<${ZWS}`);
}

export function postProcessMarkdown(markdown: string): string {
  return markdown.replace(new RegExp(ZWS, "g"), "");
}
