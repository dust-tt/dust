import { Citation, Collapsible, GlobeAltIcon } from "@dust-tt/sparkle";
import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function WebsearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<WebsearchActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Web navigation"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">Query</span>
          <div className="text-sm font-normal text-slate-500">
            {action.query}
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <WebsearchResultsGrid results={action.output?.results} />
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function WebsearchResultsGrid({
  results,
}: {
  results?: WebsearchResultType[];
}) {
  if (!results) {
    return null;
  }

  return (
    <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pt-4">
      {results.map((r, idx) => {
        return (
          <Citation
            size="xs"
            sizing="fluid"
            key={idx}
            title={r.title}
            description={r.snippet}
            href={r.link}
          />
        );
      })}
    </div>
  );
}
