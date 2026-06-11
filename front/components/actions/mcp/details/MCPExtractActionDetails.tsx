import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isExtractQueryResourceType,
  isExtractResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getFilePathDownloadUrl } from "@app/lib/swr/files";
import { isTimeFrame } from "@app/types/shared/utils/time_frame";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  Icon,
  Scan,
} from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { useState } from "react";

interface MCPExtractActionQueryProps {
  toolParams: Record<string, unknown>;
  queryResource?: {
    text: string;
    mimeType: string;
    uri: string;
  };
}

interface MCPExtractActionResultsProps {
  owner: LightWorkspaceType;
  resultResource?: {
    text: string;
    uri: string;
    mimeType: string;
    path?: string;
    fileId?: string;
    title: string;
    contentType: string;
    snippet: string | null;
  };
}

export function MCPExtractActionDetails({
  toolParams,
  toolOutput,
  displayContext,
  owner,
}: ToolExecutionDetailsProps) {
  const queryResource = toolOutput
    ?.filter(isExtractQueryResourceType)
    .map((o) => o.resource)?.[0];

  const resultResource = toolOutput
    ?.filter(isExtractResultResourceType)
    .map((o) => o.resource)?.[0];

  const jsonSchema = toolParams?.jsonSchema as JSONSchema | undefined;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation" ? "Extracting data" : "Extract data"
      }
      visual={Scan}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
            Query
          </span>
          <MCPExtractActionQuery
            toolParams={toolParams}
            queryResource={queryResource}
          />
        </div>

        {jsonSchema && (
          <div>
            <span className="font-medium text-foreground dark:text-foreground-night">
              Schema
            </span>
            <div className="py-2">
              <CodeBlock
                className="language-json max-h-60 overflow-y-auto"
                wrapLongLines={true}
              >
                {JSON.stringify(jsonSchema, null, 2)}
              </CodeBlock>
            </div>
          </div>
        )}

        {displayContext !== "conversation" && (
          <div>
            <span className="font-medium text-foreground dark:text-foreground-night">
              Results
            </span>
            <MCPExtractActionResults
              owner={owner}
              resultResource={resultResource}
            />
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}

function MCPExtractActionQuery({
  toolParams,
  queryResource,
}: MCPExtractActionQueryProps) {
  const timeFrameParam = toolParams?.timeFrame;

  if (queryResource) {
    return (
      <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
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
    <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
      Extracted from documents over {timeFrameAsString}.
    </p>
  );
}

function MCPExtractActionResults({
  owner,
  resultResource,
}: MCPExtractActionResultsProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!resultResource) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No data was extracted.
      </div>
    );
  }

  const downloadUrl = resultResource.path
    ? getFilePathDownloadUrl(owner, resultResource.path)
    : resultResource.uri || null;

  const handleDownload = async () => {
    if (!downloadUrl) {
      return;
    }

    setIsDownloading(true);
    try {
      window.open(downloadUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Citation
          className="w-48 min-w-48 max-w-48"
          containerClassName="my-2"
          onClick={downloadUrl ? handleDownload : undefined}
          tooltip={resultResource.title}
          isLoading={isDownloading}
        >
          <CitationIcons>
            <Icon visual={Scan} />
          </CitationIcons>
          <CitationTitle>{resultResource.title}</CitationTitle>
        </Citation>
      </div>

      {resultResource.snippet && (
        <div>
          <span className="font-medium text-foreground dark:text-foreground-night">
            Preview
          </span>
          <div className="py-2">
            <CodeBlock
              className="language-json max-h-60 overflow-y-auto"
              wrapLongLines={true}
            >
              {resultResource.snippet}
            </CodeBlock>
          </div>
        </div>
      )}
    </div>
  );
}
