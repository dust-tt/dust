import {
  Citation,
  CitationDescription,
  CitationIcons,
  CitationTitle,
  GlobeAltIcon,
  Icon,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { BrowseActionType } from "@app/types";

export function BrowseActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<BrowseActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Web navigation"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {action.output?.results.map((r, idx) => (
              <div
                className="flex max-h-60 flex-col gap-2 overflow-y-auto overflow-x-hidden py-1"
                key={idx}
              >
                <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                  Requested url : {r.requestedUrl}
                </span>

                {r.responseCode === "200" ? (
                  <Citation
                    key={idx}
                    href={r.browsedUrl}
                    className="w-48 min-w-48 max-w-48"
                    tooltip={r.browsedUrl}
                  >
                    <CitationIcons>
                      <Icon visual={GlobeAltIcon} />
                    </CitationIcons>
                    <CitationTitle>{r.browsedUrl}</CitationTitle>
                    <CitationDescription>
                      {r.content.slice(0, 500)}
                    </CitationDescription>
                  </Citation>
                ) : (
                  <span className="text-sm text-foreground">
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
