import {
  Citation,
  Collapsible,
  ContentMessage,
  GlobeAltIcon,
} from "@dust-tt/sparkle";
import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

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
              {formattedError && (
                <ContentMessage title="Error searching the web">
                  {formattedError}
                </ContentMessage>
              )}
            </Collapsible.Panel>
          </Collapsible>
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
