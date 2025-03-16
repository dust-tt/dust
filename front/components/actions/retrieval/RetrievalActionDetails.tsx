import {
  Chip,
  ClockIcon,
  CollapsibleComponent,
  MagnifyingGlassIcon,
  PaginatedCitationsGrid,
  Tooltip,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { makeDocumentCitations } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { RetrievalActionType } from "@app/lib/actions/retrieval";

export function RetrievalActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<RetrievalActionType>) {
  const documentCitations = makeDocumentCitations(action.documents ?? []);

  const isIncludeAction = !action.params.query;

  return (
    <ActionDetailsWrapper
      actionName={isIncludeAction ? "Include data" : "Search data"}
      defaultOpen={defaultOpen}
      visual={isIncludeAction ? ClockIcon : MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            {isIncludeAction ? "Timeframe" : "Query"}
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <RetrievalActionQuery action={action} />
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <PaginatedCitationsGrid items={documentCitations} />
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function RetrievalActionQuery({ action }: { action: RetrievalActionType }) {
  const { documents, params } = action;
  const { query, topK } = params;

  // Check if the number of chunks reached the limit defined in params.topK.
  const tooManyChunks =
    documents &&
    documents.reduce((sum, doc) => sum + doc.chunks.length, 0) >= topK &&
    !query;

  // Determine the retrieval date limit from the last document's timestamp.
  const retrievalTsLimit = documents?.[documents.length - 1]?.timestamp;
  const date = retrievalTsLimit ? new Date(retrievalTsLimit) : null;
  const retrievalDateLimitAsString = date
    ? `${date.toLocaleString("default", { month: "short" })} ${date.getDate()}`
    : null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {makeQueryDescription(action)}
      </p>
      {tooManyChunks && (
        <Tooltip
          label={`Too much data to retrieve! Retrieved ${topK} excerpts from ${documents?.length} recent docs, up to ${retrievalDateLimitAsString}.`}
          trigger={
            <Chip
              color="warning"
              label={`Limited retrieval (from now to ${retrievalDateLimitAsString})`}
            />
          }
        />
      )}
    </div>
  );
}

function makeQueryDescription(action: RetrievalActionType) {
  const { query, relativeTimeFrame, tagsIn, tagsNot } = action.params;

  const timeFrameAsString = relativeTimeFrame
    ? "over the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "across all time periods";
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  if (!query) {
    return `Searching ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
  }

  return `Searching "${query}", ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
}
