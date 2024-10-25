import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";

export function makeWebsearchResultsCitation(result: WebsearchResultType) {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    type: "document" as const,
  };
}

export function makeWebsearchResultsCitations(action: WebsearchActionType) {
  return action.output?.results.map(makeWebsearchResultsCitation) ?? [];
}
