import {
  CollapsibleComponent,
  ContentMessage,
  GlobeAltIcon,
  InformationCircleIcon,
  PaginatedCitationsGrid,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { makeWebsearchResultsCitations } from "@app/components/actions/websearch/utils";
import type { WebsearchActionType } from "@app/lib/actions/websearch";

export function WebsearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<WebsearchActionType>) {
  // Treat "no results" as a non-error case, even though serpApi returns it as an error.
  const formattedError =
    hasWebsearchError(action) &&
    !action.output.error.includes("Google hasn't returned any results")
      ? action.output.error
      : null;

  const resultsCitations = makeWebsearchResultsCitations(action);

  return (
    <ActionDetailsWrapper
      actionName="Web navigation"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Query
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {action.query}
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen: defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <>
                <PaginatedCitationsGrid items={resultsCitations} />
                {formattedError && (
                  <ContentMessage
                    title="Error searching the web"
                    icon={InformationCircleIcon}
                  >
                    {formattedError}
                  </ContentMessage>
                )}
              </>
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

type WebsearchActionWithErrorType = WebsearchActionType & {
  output: {
    error: string;
  };
};

function hasWebsearchError(
  action: WebsearchActionType
): action is WebsearchActionWithErrorType {
  return (
    !!action.output &&
    "error" in action.output &&
    typeof action.output.error === "string"
  );
}
