import type { TimeFrame } from "@app/types";

function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

function renderRelativeTimeFrameForToolOutput(
  relativeTimeFrame: TimeFrame | null
): string {
  return relativeTimeFrame
    ? "over the last " +
        (relativeTimeFrame.duration > 1
          ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
          : `${relativeTimeFrame.unit}`)
    : "across all time periods";
}

function renderTagsForToolOutput(
  tagsIn?: string[],
  tagsNot?: string[]
): string {
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  return `${tagsInAsString}${tagsNotAsString}`;
}

function renderSearchNodeIds(nodeIds?: string[]): string {
  return nodeIds && nodeIds.length > 0
    ? `within ${nodeIds.length} different subtrees `
    : "";
}

export function makeQueryTextForDataSourceSearch({
  query,
  timeFrame,
  tagsIn,
  tagsNot,
  nodeIds,
}: {
  query: string;
  timeFrame: TimeFrame | null;
  tagsIn?: string[];
  tagsNot?: string[];
  nodeIds?: string[];
}): string {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);
  const nodeIdsAsString = renderSearchNodeIds(nodeIds);

  return query
    ? `Searching "${query}" ${nodeIdsAsString}${timeFrameAsString}${tagsAsString}.`
    : `Searching ${timeFrameAsString}${tagsAsString}.`;
}

export function makeQueryTextForFind(
  query?: string,
  rootNodeId?: string,
  mimeTypes?: string[],
  nextPageCursor?: string
): string {
  const queryText = query ? ` "${query}"` : " all content";
  const scope = rootNodeId
    ? ` under ${rootNodeId}`
    : " across the entire data sources";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return `Searching for${queryText}${scope}${types}${pagination}.`;
}

export function makeQueryTextForList(
  nodeId: string | null,
  mimeTypes?: string[],
  nextPageCursor?: string
): string {
  const location = nodeId ? ` within node "${nodeId}"` : " at the root level";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return `Listing content${location}${types}${pagination}.`;
}
