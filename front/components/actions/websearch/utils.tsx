import { DocumentTextIcon } from "@dust-tt/sparkle";

import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import type { WebsearchActionType, WebsearchResultType } from "@app/types";

export function makeWebsearchResultsCitation(
  result: WebsearchResultType
): MarkdownCitation {
  return {
    description: result.snippet,
    href: result.link,
    title: result.title,
    icon: <DocumentTextIcon />,
  };
}

export function makeWebsearchResultsCitations(
  action: WebsearchActionType
): MarkdownCitation[] {
  return action.output?.results.map(makeWebsearchResultsCitation) ?? [];
}
