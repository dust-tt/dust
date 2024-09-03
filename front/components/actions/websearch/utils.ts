import type { Citation } from "@dust-tt/sparkle";
import type { WebsearchActionType } from "@dust-tt/types";

interface WebsearchResultCitation {
  href: string;
  title: string;
  type: Exclude<React.ComponentProps<typeof Citation>["type"], undefined>;
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
