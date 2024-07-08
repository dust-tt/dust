import type { CitationType } from "@dust-tt/sparkle/dist/esm/components/Citation";
import type { WebsearchActionType } from "@dust-tt/types";

interface WebsearchResultCitation {
  href: string;
  title: string;
  type: CitationType;
}

export function makeWebsearchResultsCitations(
  action: WebsearchActionType
): WebsearchResultCitation[] {
  return (
    action.output?.results.map((r) => {
      return {
        description: r.snippet,
        href: r.link,
        title: r.title,
        type: "document",
      };
    }) ?? []
  );
}
