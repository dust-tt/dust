import { createDocument } from "@mixmark-io/domino";
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
 * Uses domino to parse HTML since `document` is not available in service workers.
 */
export function htmlToMarkdown(html: string): string {
  const doc = createDocument(html);
  return turndownService.turndown(doc);
}
