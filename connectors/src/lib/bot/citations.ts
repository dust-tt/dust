import type { AgentActionPublicType } from "@dust-tt/client";
import {
  isSearchResultResourceType,
  isWebsearchResultResourceType,
} from "@dust-tt/client";

export interface MessageFootnote {
  index: number;
  link: string;
  text: string;
}

export type MessageFootnotes = MessageFootnote[];

export function annotateCitations(
  content: string,
  actions: AgentActionPublicType[]
): { formattedContent: string; footnotes: MessageFootnotes } {
  const references: {
    [key: string]: {
      reference: string;
      link: string;
      title: string;
    };
  } = {};

  for (const action of actions) {
    if (action && action.output) {
      // Handle MCP search results.
      action.output?.filter(isSearchResultResourceType).forEach((o) => {
        if (o.type === "resource" && o.resource.ref) {
          const r = o.resource;
          const ref = r.ref;
          if (ref) {
            references[ref] = {
              reference: ref,
              link: r.uri,
              title: r.text,
            };
          }
        }
      });

      // Handle MCP websearch results.
      action.output?.filter(isWebsearchResultResourceType).forEach((o) => {
        if (o.type === "resource" && o.resource.reference) {
          const r = o.resource;
          const ref = r.reference;
          if (ref) {
            references[ref] = {
              reference: ref,
              link: r.uri,
              title: r.title,
            };
          }
        }
      });
    }
  }

  if (Object.keys(references).length === 0) {
    return { formattedContent: removeCitations(content), footnotes: [] };
  }

  let counter = 0;
  const refCounter: { [key: string]: number } = {};
  const footnotes: MessageFootnotes = [];

  const formattedContent = content.replace(
    /:cite\[[a-zA-Z0-9, ]+\]/g,
    (match) => {
      const keys = match.slice(6, -1).split(","); // Slice off ":cite[" and "]" then split by comma.

      return keys
        .map((key) => {
          const k = key.trim();
          const ref = references[k];

          if (ref) {
            if (!refCounter[k]) {
              counter++;
              refCounter[k] = counter;

              footnotes.push({
                index: counter,
                link: ref.link,
                text: ref.title,
              });

              return `[${refCounter[k]}]`;
            }

            return `[${refCounter[k]}]`;
          }

          return "";
        })
        .join(" ");
    }
  );

  return { formattedContent, footnotes };
}

/**
 * Remove citation markers from content without replacing them with footnotes.
 */
function removeCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

/**
 * Converts plain URLs to Markdown links for Teams Adaptive Cards.
 * Teams Adaptive Cards require Markdown format [text](url) for clickable links.
 */
export function convertUrlsToMarkdown(text: string): string {
  // Regex to match URLs that are NOT already part of a Markdown link.
  // Negative lookbehind (?<!\() ensures we don't match URLs already in Markdown format.
  // Negative lookahead (?!\)) ensures we're not inside a Markdown link.
  const urlRegex = /(?<!\()(https?:\/\/[^\s)]+)(?!\))/g;

  // Use replace with offset parameter to avoid expensive indexOf calls.
  return text.replace(urlRegex, (url, offset) => {
    // Check if this URL is already part of a Markdown link by looking at surrounding context.
    // The offset gives us the position, so we can check directly (O(1) instead of O(n)).
    const beforeChar = offset > 0 ? text[offset - 1] : "";
    const afterChar =
      offset + url.length < text.length ? text[offset + url.length] : "";

    // If URL is already wrapped in () from a Markdown link, don't convert.
    if (beforeChar === "(" && afterChar === ")") {
      return url;
    }

    // Convert to Markdown link with the URL as both text and href.
    return `[${url}](${url})`;
  });
}
