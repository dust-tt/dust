import type {
  IncludeResultResourceType,
  WarningResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderRelativeTimeFrameForToolOutput } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  getDataSourceNameFromView,
  getDisplayNameForDocument,
} from "@app/lib/data_sources";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { stripNullBytes } from "@app/types/shared/utils/string_utils";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export function makeIncludeWarningResource(
  documents: CoreAPIDocument[],
  topK: number,
  timeFrame: TimeFrame | null
): WarningResourceType | null {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);

  // Check if the number of chunks reached the limit defined in params.topK.
  const tooManyChunks =
    documents &&
    documents.reduce((sum, doc) => sum + doc.chunks.length, 0) >= topK;

  // Determine the retrieval date limit from the last document's timestamp.
  const retrievalTsLimit = documents?.[documents.length - 1]?.timestamp;
  const date = retrievalTsLimit ? new Date(retrievalTsLimit) : null;
  const retrievalDateLimitAsString = date
    ? `${date.toLocaleString("default", { month: "short" })} ${date.getDate()}`
    : null;

  return tooManyChunks
    ? {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WARNING,
        warningTitle: `Only includes documents since ${retrievalDateLimitAsString}.`,
        warningData: { includeTimeLimit: retrievalDateLimitAsString ?? "" },
        text: `Warning: could not include all documents ${timeFrameAsString}. Only includes documents since ${retrievalDateLimitAsString}.`,
        uri: "",
      }
    : null;
}

export function makeIncludeResultResource(
  doc: CoreAPIDocument,
  dataSourceView: DataSourceViewType,
  refs: string[]
): IncludeResultResourceType {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_RESULT,
    uri: doc.source_url ?? "",
    text: getDisplayNameForDocument(doc),

    id: doc.document_id,
    source: {
      provider: dataSourceView.dataSource.connectorProvider ?? undefined,
      name: getDataSourceNameFromView(dataSourceView),
    },
    tags: doc.tags,
    ref: refs.shift() as string,
    chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
  };
}
