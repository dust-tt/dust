/**
 * Markdown utilities for Dust directives.
 */

import type { CitationType } from "@/lib/types/conversations";

// Regex patterns for plain text extraction
const AGENT_MENTION_REGEX = /:mention\[([^\]]+)\]\{sId=([^}]+?)\}/g;
const USER_MENTION_REGEX = /:mention_user\[([^\]]+)\]\{sId=([^}]+?)\}/g;
const CITATION_REGEX = /:cite\[([^\]]+)\]/g;
const PASTED_CONTENT_REGEX =
  /:pasted_content\[([^\]]+)\]\{pastedId=([^}]+?)\}/g;

/**
 * Extracts citations from agent actions output.
 *
 * Looks for search results, websearch results, and other resources
 * that contain reference information.
 */
export function extractCitationsFromActions(
  actions: Array<{
    output: Array<
      | { type: "text"; text: string }
      | {
          type: "resource";
          resource: {
            ref?: string;
            reference?: string;
            uri?: string;
            text?: string;
            title?: string;
            mimeType?: string;
            source?: { provider?: string };
            metadata?: { title?: string; connectorProvider?: string };
          };
        }
    > | null;
  }>
): Record<string, CitationType> {
  const citations: Record<string, CitationType> = {};

  for (const action of actions) {
    if (!action.output) continue;

    for (const output of action.output) {
      // Only process resource outputs
      if (output.type !== "resource") continue;

      const resource = output.resource;

      // Search results (have ref)
      if (resource.ref) {
        citations[resource.ref] = {
          href: resource.uri || "",
          title: resource.text || resource.metadata?.title || "",
          provider:
            resource.source?.provider ||
            resource.metadata?.connectorProvider ||
            "document",
          contentType: resource.mimeType,
        };
      }

      // Websearch results (have reference)
      if (resource.reference) {
        citations[resource.reference] = {
          href: resource.uri || "",
          title: resource.title || "",
          provider: "webcrawler",
          contentType: resource.mimeType,
        };
      }
    }
  }

  return citations;
}

/**
 * Strips directive syntax from markdown and returns plain text.
 * Useful for accessibility or plain text previews.
 */
export function stripDirectivesToPlainText(markdown: string): string {
  return markdown
    .replace(AGENT_MENTION_REGEX, (_, name) => `@${name}`)
    .replace(USER_MENTION_REGEX, (_, name) => `@${name}`)
    .replace(CITATION_REGEX, "")
    .replace(PASTED_CONTENT_REGEX, (_, title) => `[${title}]`);
}
