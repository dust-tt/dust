import logger from "@connectors/logger/logger";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";

const turndownService = new TurndownService();

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

function htmlToPlainText(html: string): string {
  const chunks: string[] = [];

  const parser = new Parser(
    {
      onopentag(name) {
        if (BLOCK_TAGS.has(name)) {
          chunks.push("\n");
        }
      },
      ontext(text) {
        chunks.push(text);
      },
      onclosetag(name) {
        if (BLOCK_TAGS.has(name)) {
          chunks.push("\n");
        }
      },
    },
    { decodeEntities: true }
  );

  parser.write(html);
  parser.end();

  return chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Converts HTML to markdown. Falls back to plain-text extraction when Turndown's
 * domino parser overflows the stack on deeply nested markup (e.g. long email reply chains).
 */
export function htmlToMarkdown(html: string): string {
  try {
    return turndownService.turndown(html);
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    logger.warn(
      { htmlLength: html.length },
      "HTML to markdown conversion failed due to excessive nesting, falling back to plain text extraction."
    );

    return htmlToPlainText(html);
  }
}
