// Provider-native web search returns its citations as structured metadata
// (Anthropic `web_search_result_location` blocks, OpenAI `url_citation`
// annotations) rather than as text the model wrote. Dust's own `:cite[REF]`
// scheme cannot carry them: refs are keyed on a persisted MCP action row, and a
// server-side search produces none. So we splice the sources into the answer as
// ordinary markdown links, which the existing markdown pipeline renders with no
// further plumbing.

// Characters that would break out of a markdown link label.
const LINK_LABEL_ESCAPE_RE = /([[\]\\])/g;

// Falls back to the bare host when the provider reports no title, so the link
// still reads as a source rather than as a naked URL.
function citationLabel(title: string | null | undefined, url: string): string {
  const trimmed = title?.trim();
  if (trimmed) {
    return trimmed.replace(LINK_LABEL_ESCAPE_RE, "\\$1");
  }

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Renders one provider web-search citation as a trailing markdown link, e.g.
 * ` ([FIFA World Cup](https://example.com))`.
 */
export function formatWebSearchCitationLink({
  title,
  url,
}: {
  title: string | null | undefined;
  url: string;
}): string {
  return ` ([${citationLabel(title, url)}](${url}))`;
}

export interface WebSearchCitationAnnotation {
  title: string | null | undefined;
  url: string;
  // Index of the character just past the cited span in the finished text.
  endIndex: number;
}

/**
 * Splices markdown links for each annotation into `text` at the end of the span
 * it cites. Used by providers that report citations as offsets into a completed
 * message rather than as deltas next to the text they annotate.
 *
 * Returns `text` unchanged when there is nothing to insert.
 */
export function insertWebSearchCitationLinks(
  text: string,
  annotations: readonly WebSearchCitationAnnotation[]
): string {
  if (annotations.length === 0) {
    return text;
  }

  // Ascending by offset so the segments below are cut in order. Copied first:
  // the annotations array belongs to the caller.
  const sorted = [...annotations].sort((a, b) => a.endIndex - b.endIndex);

  const segments: string[] = [];
  let cursor = 0;
  let previousLink: string | undefined;
  for (const annotation of sorted) {
    const link = formatWebSearchCitationLink(annotation);
    // Providers repeat a source across adjacent spans; emitting the same link
    // twice in a row is noise, not a second citation.
    if (link === previousLink) {
      continue;
    }

    // Clamp: a provider offset past the end of the text would otherwise silently
    // drop the tail of the answer.
    const at = Math.min(Math.max(annotation.endIndex, cursor), text.length);
    segments.push(text.slice(cursor, at), link);
    cursor = at;
    previousLink = link;
  }
  segments.push(text.slice(cursor));

  return segments.join("");
}
