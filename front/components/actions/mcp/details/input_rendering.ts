import type {
  DataSourceFilesystemFindInputType,
  DataSourceFilesystemListInputType,
  IncludeInputType,
  SearchInputTypeWithTags,
} from "@app/lib/actions/mcp_internal_actions/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import { parseTimeFrame } from "@app/types/shared/utils/time_frame";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

export function renderLastTimeFrame(
  t: Translate,
  { duration, unit }: TimeFrame
): string {
  switch (unit) {
    case "hour":
      return t(
        msg`over the last ${plural(duration, { one: "hour", other: "# hours" })}`
      );
    case "day":
      return t(
        msg`over the last ${plural(duration, { one: "day", other: "# days" })}`
      );
    case "week":
      return t(
        msg`over the last ${plural(duration, { one: "week", other: "# weeks" })}`
      );
    case "month":
      return t(
        msg`over the last ${plural(duration, { one: "month", other: "# months" })}`
      );
    case "year":
      return t(
        msg`over the last ${plural(duration, { one: "year", other: "# years" })}`
      );
    default:
      assertNever(unit);
  }
}

function renderRelativeTimeFrame(
  t: Translate,
  relativeTimeFrame: TimeFrame | null
): string {
  return relativeTimeFrame
    ? renderLastTimeFrame(t, relativeTimeFrame)
    : t(msg`across all time periods`);
}

function renderTagsForToolOutput(
  t: Translate,
  tagsIn: string[] = [],
  tagsNot: string[] = []
): string {
  const tagsInList = tagsIn.join(", ");
  const tagsNotList = tagsNot.join(", ");
  const tagsInAsString =
    tagsIn.length > 0 ? `, ${t(msg`with labels ${tagsInList}`)}` : "";
  const tagsNotAsString =
    tagsNot.length > 0 ? `, ${t(msg`excluding labels ${tagsNotList}`)}` : "";
  return `${tagsInAsString}${tagsNotAsString}`;
}

function renderMimeTypesAndPagination(
  t: Translate,
  mimeTypes: string[] = [],
  nextPageCursor: string | null | undefined
): string {
  const mimeTypesList = mimeTypes.map(renderMimeType).join(", ");
  const types = mimeTypes.length ? ` ${t(msg`(${mimeTypesList} files)`)}` : "";
  const pagination = nextPageCursor ? ` - ${t(msg`next page`)}` : "";

  return `${types}${pagination}`;
}

export function makeQueryTextForDataSourceSearch(
  t: Translate,
  { query, relativeTimeFrame, tagsIn, tagsNot }: SearchInputTypeWithTags
): string {
  const timeFrameAsString = renderRelativeTimeFrame(
    t,
    parseTimeFrame(relativeTimeFrame ?? "all")
  );
  const tagsAsString = renderTagsForToolOutput(t, tagsIn, tagsNot);

  return query
    ? t(msg`Searching "${query}" ${timeFrameAsString}${tagsAsString}.`)
    : t(msg`Searching ${timeFrameAsString}${tagsAsString}.`);
}

export function makeQueryTextForFind(
  t: Translate,
  {
    query,
    rootNodeId,
    mimeTypes,
    nextPageCursor,
  }: DataSourceFilesystemFindInputType
): string {
  let searchText: string;
  if (query && rootNodeId) {
    searchText = t(msg`Searching for "${query}" under ${rootNodeId}`);
  } else if (query) {
    searchText = t(
      msg`Searching for "${query}" across the entire data sources`
    );
  } else if (rootNodeId) {
    searchText = t(msg`Searching for all content under ${rootNodeId}`);
  } else {
    searchText = t(
      msg`Searching for all content across the entire data sources`
    );
  }
  const suffix = renderMimeTypesAndPagination(t, mimeTypes, nextPageCursor);

  return `${searchText}${suffix}.`;
}

export function makeQueryTextForList(
  t: Translate,
  { nodeId, mimeTypes, nextPageCursor }: DataSourceFilesystemListInputType
): string {
  const listingText = nodeId
    ? t(msg`Listing content within node "${nodeId}"`)
    : t(msg`Listing content at the root level`);
  const suffix = renderMimeTypesAndPagination(t, mimeTypes, nextPageCursor);

  return `${listingText}${suffix}.`;
}

export function makeQueryTextForInclude(
  t: Translate,
  { timeFrame }: IncludeInputType
): string {
  const timeFrameAsString = renderRelativeTimeFrame(t, timeFrame ?? null);

  return t(msg`Requested to include documents ${timeFrameAsString}`);
}
