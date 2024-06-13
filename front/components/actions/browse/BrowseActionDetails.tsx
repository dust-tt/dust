import { Citation, GlobeAltIcon } from "@dust-tt/sparkle";
import type { BrowseActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function BrowseActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<BrowseActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Browse"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-slate-500">
            {action.output?.results.map((r, idx) => (
              <div
                className="flex max-h-60 flex-col gap-2 overflow-y-auto overflow-x-hidden py-1"
                key={idx}
              >
                <span className="text-sm font-bold text-slate-900">
                  Requested url : {r.requestedUrl}
                </span>

                {r.responseCode === "200" ? (
                  <Citation
                    key={idx}
                    size="xs"
                    type="document"
                    sizing="fluid"
                    title={r.browsedUrl}
                    description={r.content.slice(0, 500)}
                    href={r.browsedUrl}
                  />
                ) : (
                  <span className="text-sm text-slate-900">
                    Cannot fetch content, error code : {r.responseCode}.
                    {r.errorMessage}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
