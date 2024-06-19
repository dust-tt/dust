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
      href: r.sourceUrl,
      title: r.title,
      type: "document",
    };
  });
}
