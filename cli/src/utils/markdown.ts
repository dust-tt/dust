import type { MarkedExtension } from "marked";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

// markedTerminal() returns a MarkedExtension but the types are inaccurate
const marked = new Marked(
  markedTerminal() as unknown as MarkedExtension
);

/**
 * Renders markdown text for terminal display.
 * Returns a string with ANSI escape codes for formatting.
 */
export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text, { async: false }) as string;
    // Remove trailing newlines added by marked
    return rendered.replace(/\n+$/, "");
  } catch {
    return text;
  }
}
