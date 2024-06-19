import type { CitationType } from "@dust-tt/sparkle/dist/cjs/components/Citation";
import type { WebsearchResultType } from "@dust-tt/types";

interface WebsearchResultCitation {
  href: string;
  title: string;
  type: CitationType;
}

export function makeWebsearchResultsCitations(
  results: WebsearchResultType[]
): WebsearchResultCitation[] {
  return results.map((r) => {
    return {
      description: r.snippet,
      // @todo[daph] 2024-07-19 Remove the fallback on link.
      href: r.sourceUrl ?? r.link,
      title: r.title,
      type: "document",
    };
  });
}
