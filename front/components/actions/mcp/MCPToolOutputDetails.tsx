import {
  Citation,
  CitationIcons,
  CitationTitle,
  CodeBlock,
  CollapsibleComponent,
  ContentBlockWrapper,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  Markdown,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import type {
  ReasoningSuccessOutputType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { LightWorkspaceType } from "@app/types";

// This file contains one component per output type.

interface ThinkingBlockProps {
  resource: ThinkingOutputType;
}

export function ThinkingBlock({ resource }: ThinkingBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage
          title="Reasoning" // TODO(mcp): to be challenged by the design team (could be "Thoughts")
          variant="primary"
          icon={InformationCircleIcon}
          size="lg"
        >
          <Markdown
            content={resource.text}
            isStreaming={false}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    )
  );
}

interface ReasoningSuccessBlockProps {
  resource: ReasoningSuccessOutputType;
}

export function ReasoningSuccessBlock({
  resource,
}: ReasoningSuccessBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <Markdown
          content={resource.text}
          textColor="text-muted-foreground dark:text-muted-foreground-night"
          isStreaming={false}
          forcedTextSize="md"
          isLastMessage={false}
        />
      </div>
    )
  );
}

interface SqlQueryBlockProps {
  resource: SqlQueryOutputType;
}

export function SqlQueryBlock({ resource }: SqlQueryBlockProps) {
  return (
    <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
      <ContentBlockWrapper content={resource.text}>
        <CodeBlock
          className="language-sql max-h-60 overflow-y-auto"
          wrapLongLines={true}
        >
          {resource.text}
        </CodeBlock>
      </ContentBlockWrapper>
    </div>
  );
}

interface ToolGeneratedFileDetailsProps {
  resource: ToolGeneratedFileType;
  icon: React.ComponentType<{ className?: string }>;
  owner: LightWorkspaceType;
}

export function ToolGeneratedFileDetails({
  resource,
  icon,
  owner,
}: ToolGeneratedFileDetailsProps) {
  const sendNotification = useSendNotification();

  const handleDownload = useCallback(() => {
    try {
      const downloadUrl = `/api/w/${owner.sId}/files/${resource.fileId}?action=download`;
      // Open the download URL in a new tab/window. Otherwise we get a CORS error due to the redirection
      // to cloud storage.
      window.open(downloadUrl, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
      sendNotification({
        title: "Download Failed",
        type: "error",
        description: "An error occurred while opening the download link.",
      });
    }
  }, [resource.fileId, sendNotification, owner.sId]);

  return (
    <>
      <div>
        <Citation
          className="w-48 min-w-48 max-w-48"
          containerClassName="my-2"
          onClick={handleDownload}
          tooltip={resource.title}
        >
          <CitationIcons>
            <Icon visual={icon} />
          </CitationIcons>
          <CitationTitle>{resource.title}</CitationTitle>
        </Citation>
      </div>
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
              className="language-csv max-h-60 overflow-y-auto"
              wrapLongLines={true}
            >
              {resource.snippet}
            </CodeBlock>
          </div>
        }
      />
    </>
  );
}
