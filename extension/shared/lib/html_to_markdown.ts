import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Remove script, style, and other non-content tags.
turndownService.remove(["script", "style", "noscript", "template"]);

/**
 * Convert an HTML string to Markdown using Turndown.
 */
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}
