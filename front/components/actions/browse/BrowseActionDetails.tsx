import { Citation, Collapsible, GlobeAltIcon, Page } from "@dust-tt/sparkle";
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
          <span className="text-sm font-bold text-slate-900">
            Browsed URLs :
          </span>
          <div className="max-h-24 overflow-y-auto overflow-x-hidden text-sm font-normal text-slate-500">
            <ul>
              {action.urls.map((url) => (
                <li key={url}>
                  <a href={url}>{url}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">
                Final results
              </span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <>
                <Page.Separator />
                <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto overflow-x-hidden py-1">
                  {action.output?.results
                    ?.filter((r) => r.response.code === "200")
                    .map((r, idx) => (
                      <Citation
                        key={idx}
                        size="xs"
                        index={idx + 1}
                        type="document"
                        sizing="fluid"
                        title={r.response.url}
                        description={r.content.slice(0, 500)}
                        href={r.response.url}
                      />
                    ))}
                </div>
              </>
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
