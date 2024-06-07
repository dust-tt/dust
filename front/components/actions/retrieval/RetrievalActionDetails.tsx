import { Citation, Collapsible, MagnifyingGlassIcon } from "@dust-tt/sparkle";
import type {
  RetrievalActionType,
  RetrievalDocumentType,
} from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { makeDocumentCitations } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function RetrievalActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<RetrievalActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Search data"
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">Query</span>
          <div className="text-sm font-normal text-slate-500">
            {makeQueryDescription(action)}
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <RetrievedDocumentsGrid
                documents={action.documents ?? undefined}
              />
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function RetrievedDocumentsGrid({
  documents,
}: {
  documents?: RetrievalDocumentType[];
}) {
  if (!documents) {
    return null;
  }

  const documentCitations = makeDocumentCitations(documents);
  return (
    <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pt-4">
      {documentCitations.map((d, idx) => {
        return (
          <Citation
            size="xs"
            sizing="fluid"
            key={idx}
            title={d.title}
            type={d.provider}
            href={d.link}
          />
        );
      })}
    </div>
  );
}

function makeQueryDescription(action: RetrievalActionType) {
  const { query, relativeTimeFrame } = action.params;

  const timeFrameAsString = relativeTimeFrame
    ? "over the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "across all time periods";

  return `Searching "${query}", ${timeFrameAsString}.`;
}
