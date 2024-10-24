import type { Citation } from "@dust-tt/sparkle";
import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";

interface WebsearchResultCitation {
  href: string;
  title: string;
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
}

export function makeWebsearchResultsCitation(result: WebsearchResultType) {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    type: "document" as const,
  };
}

export function makeWebsearchResultsCitations(
  action: WebsearchActionType
): WebsearchResultCitation[] {
  return action.output?.results.map(makeWebsearchResultsCitation) ?? [];
}
