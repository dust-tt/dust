import { Collapsible, GlobeAltIcon } from "@dust-tt/sparkle";
import type { BrowseActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function BrowseActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<BrowseActionType>) {
  console.log(action);

  return (
    <ActionDetailsWrapper
      actionName="Browse"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">URLS</span>
          <div className="text-sm font-normal text-slate-500">
            {action.urls.join(", ")}
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>Browse result</Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
