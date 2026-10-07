import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { renderLastTimeFrame } from "@app/components/actions/mcp/details/input_rendering";
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
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
        displayContext === "conversation" ? t`Extracting data` : t`Extract data`
      }
      visual={Scan}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">
            <Trans>Query</Trans>
          </span>
          <MCPExtractActionQuery
            toolParams={toolParams}
            queryResource={queryResource}
          />
        </div>

        {jsonSchema && (
          <div>
            <span className="font-medium text-foreground">
              <Trans>Schema</Trans>
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
            <span className="font-medium text-foreground">
              <Trans>Results</Trans>
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
  const { t } = useLingui();
  const timeFrameParam = toolParams?.timeFrame;

  if (queryResource) {
    return (
      <p className="text-sm font-normal text-muted-foreground">
        {queryResource.text}
      </p>
    );
  }

  // Fallback: Format timeframe description from params.
  const timeFrameAsString =
    timeFrameParam && isTimeFrame(timeFrameParam)
      ? renderLastTimeFrame(t, timeFrameParam)
      : null;

  return (
    <p className="text-sm font-normal text-muted-foreground">
      {timeFrameAsString ? (
        <Trans>Extracted from documents {timeFrameAsString}.</Trans>
      ) : (
        <Trans>Extracted from documents over all time.</Trans>
      )}
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
      <div className="text-sm text-muted-foreground">
        <Trans>No data was extracted.</Trans>
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
          <span className="font-medium text-foreground">
            <Trans>Preview</Trans>
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
