import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";

import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";

export function makeWebsearchResultsCitation(
  result: WebsearchResultType
): MarkdownCitation {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    type: "document" as const,
  };
}

export function makeWebsearchResultsCitations(
  action: WebsearchActionType
): MarkdownCitation[] {
  return action.output?.results.map(makeWebsearchResultsCitation) ?? [];
}
