import type { AgentActionPublicType } from "@dust-tt/client";
import { isExtractQueryResourceType } from "@dust-tt/client";
import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScanIcon,
} from "@dust-tt/sparkle";
import { isTimeFrame } from "@extension/shared/lib/time_frame";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";
import type { JSONSchema7 as JSONSchema } from "json-schema";

interface MCPExtractActionQueryProps {
  action: AgentActionPublicType;
  queryResource?: {
    text: string;
    mimeType: string;
    uri: string;
  };
}

export function MCPExtractActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const queryResource = action.output
    ?.filter(isExtractQueryResourceType)
    .map((o) => o.resource)?.[0];

  const jsonSchema = action.params?.jsonSchema as JSONSchema | undefined;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Extracting data" : "Extract data"
      }
      visual={ScanIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="heading-sm text-foreground dark:text-foreground-night">
            Query
          </span>
          <MCPExtractActionQuery
            action={action}
            queryResource={queryResource}
          />
        </div>

        {jsonSchema && (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <span className="heading-sm text-foreground dark:text-foreground-night">
                Schema
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="py-2">
                <CodeBlock
                  className="language-json max-h-60 overflow-y-auto"
                  wrapLongLines
                >
                  {JSON.stringify(jsonSchema, null, 2)}
                </CodeBlock>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}

function MCPExtractActionQuery({
  action,
  queryResource,
}: MCPExtractActionQueryProps) {
  const timeFrameParam = action.params?.timeFrame;

  if (queryResource) {
    return (
      <p className="text-muted-foreground dark:text-muted-foreground-night text-sm font-normal">
        {queryResource.text}
      </p>
    );
  }

  // Fallback: Format timeframe description from params.
  const timeFrameAsString =
    timeFrameParam && isTimeFrame(timeFrameParam)
      ? "the last " +
        (timeFrameParam.duration > 1
          ? `${timeFrameParam.duration} ${timeFrameParam.unit}s`
          : `${timeFrameParam.unit}`)
      : "all time";

  return (
    <p className="text-muted-foreground dark:text-muted-foreground-night text-sm font-normal">
      Extracted from documents over {timeFrameAsString}.
    </p>
  );
}
