import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  Icon,
  ScanIcon,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isExtractQueryResourceType,
  isExtractResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isTimeFrame } from "@app/types/shared/utils/time_frame";

export function MCPExtractActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const queryResource = action.output
    ?.filter(isExtractQueryResourceType)
    .map((o) => o.resource)?.[0];

  const resultResource = action.output
    ?.filter(isExtractResultResourceType)
    .map((o) => o.resource)?.[0];

  const jsonSchema = action.params?.jsonSchema as JSONSchema | undefined;

  return (
    <ActionDetailsWrapper
      actionName="Extract data"
      defaultOpen={defaultOpen}
      visual={ScanIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Query
          </span>
          <MCPExtractActionQuery
            action={action}
            queryResource={queryResource}
          />
        </div>

        {jsonSchema && (
          <div>
            <CollapsibleComponent
              rootProps={{ defaultOpen: false }}
              triggerChildren={
                <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  Schema
                </span>
              }
              contentChildren={
                <div className="py-2">
                  <CodeBlock
                    className="language-json max-h-60 overflow-y-auto"
                    wrapLongLines={true}
                  >
                    {JSON.stringify(jsonSchema, null, 2)}
                  </CodeBlock>
                </div>
              }
            />
          </div>
        )}

        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <MCPExtractActionResults resultResource={resultResource} />
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function MCPExtractActionQuery({
  action,
  queryResource,
}: {
  action: MCPActionType;
  queryResource?: {
    text: string;
    mimeType: string;
    uri: string;
  };
}) {
  const timeFrameParam = action.params?.timeFrame;

  if (queryResource) {
    return (
      <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {queryResource.text}
      </p>
    );
  }

  // Fallback: Format timeframe description from params
  const timeFrameAsString =
    timeFrameParam && isTimeFrame(timeFrameParam)
      ? "the last " +
        (timeFrameParam.duration > 1
          ? `${timeFrameParam.duration} ${timeFrameParam.unit}s`
          : `${timeFrameParam.unit}`)
      : "all time";

  return (
    <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
      Extracted from documents over {timeFrameAsString}.
    </p>
  );
}

function MCPExtractActionResults({
  resultResource,
}: {
  resultResource?: {
    text: string;
    uri: string;
    mimeType: string;
    fileId: string;
    title: string;
    contentType: string;
    snippet: string | null;
  };
}) {
  if (!resultResource) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No data was extracted.
      </div>
    );
  }

  const handleDownload = () => {
    try {
      window.open(resultResource.uri, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Citation
          className="w-48 min-w-48 max-w-48"
          containerClassName="my-2"
          onClick={handleDownload}
          tooltip={resultResource.title}
        >
          <CitationIcons>
            <Icon visual={ScanIcon} />
          </CitationIcons>
          <CitationTitle>{resultResource.title}</CitationTitle>
        </Citation>
      </div>

      {resultResource.snippet && (
        <CollapsibleComponent
          rootProps={{ defaultOpen: false }}
          triggerChildren={
            <span className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
              Preview
            </span>
          }
          contentChildren={
            <div className="py-2">
              <CodeBlock
                className="language-json max-h-60 overflow-y-auto"
                wrapLongLines={true}
              >
                {resultResource.snippet}
              </CodeBlock>
            </div>
          }
        />
      )}
    </div>
  );
}
