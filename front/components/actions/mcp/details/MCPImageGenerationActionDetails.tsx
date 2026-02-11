import { ActionImageIcon, Chip, cn, Separator } from "@dust-tt/sparkle";
import React from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type {
  ActionDetailsDisplayContext,
  ToolExecutionDetailsProps,
} from "@app/components/actions/mcp/details/types";
import { isGenerateImageInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { useFileMetadata } from "@app/lib/swr/files";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { LightWorkspaceType } from "@app/types/user";

const QUALITY_LABELS: Record<string, string> = {
  low: "1K",
  medium: "2K",
  high: "4K",
};

function formatOutputFileName(outputName: string): string {
  return outputName.toLowerCase().endsWith(".png")
    ? outputName
    : `${outputName}.png`;
}

interface ReferenceImageChipProps {
  fileId: string;
  owner: LightWorkspaceType;
}

function ReferenceImageChip({ fileId, owner }: ReferenceImageChipProps) {
  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId,
    owner,
  });

  const label = isFileMetadataLoading
    ? "Loading..."
    : (fileMetadata?.fileName ?? fileId);

  return <Chip size="xs" color="highlight" label={label} />;
}

export function MCPImageGenerationActionDetails({
  displayContext,
  toolParams,
  owner,
}: ToolExecutionDetailsProps) {
  if (!isGenerateImageInputType(toolParams)) {
    return (
      <ActionDetailsWrapper
        displayContext={displayContext}
        actionName={
          displayContext === "conversation"
            ? "Generating image"
            : "Generate image"
        }
        visual={ActionImageIcon}
      />
    );
  }

  const { prompt, outputName, aspectRatio, referenceImages, quality } =
    toolParams;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? "Generating image"
          : "Generate image"
      }
      visual={ActionImageIcon}
    >
      <div
        className={cn(
          "flex flex-col gap-3",
          displayContext === "conversation" ? "pl-6" : "pt-2"
        )}
      >
        <div className="flex flex-wrap gap-1">
          {referenceImages &&
            referenceImages.length > 0 &&
            referenceImages.map((fileId) => (
              <ReferenceImageChip key={fileId} fileId={fileId} owner={owner} />
            ))}
          {outputName && (
            <Chip
              size="xs"
              color="success"
              label={formatOutputFileName(outputName)}
            />
          )}
          {aspectRatio && <Chip size="xs" label={aspectRatio} />}
          {quality && (
            <Chip size="xs" label={`${QUALITY_LABELS[quality]} quality`} />
          )}
        </div>
        <p
          className={cn(
            "text-sm text-muted-foreground dark:text-muted-foreground-night",
            displayContext === "conversation" ? "line-clamp-3" : ""
          )}
        >
          {prompt}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}

interface MCPImageGenerationGroupedDetailsProps {
  displayContext: ActionDetailsDisplayContext;
  actions: AgentMCPActionWithOutputType[];
  owner: LightWorkspaceType;
}

export function MCPImageGenerationGroupedDetails({
  displayContext,
  actions,
  owner,
}: MCPImageGenerationGroupedDetailsProps) {
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={`Generating ${actions.length} images`}
      visual={ActionImageIcon}
    >
      <div
        className={cn(
          "flex flex-col gap-4",
          displayContext === "conversation" ? "pl-6" : "pt-2"
        )}
      >
        {actions.map((action, index) => {
          const params = action.params;
          if (!isGenerateImageInputType(params)) {
            return null;
          }
          const { prompt, outputName, aspectRatio, referenceImages, quality } =
            params;
          return (
            <React.Fragment key={action.id}>
              {index > 0 && <Separator />}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1">
                  {referenceImages &&
                    referenceImages.length > 0 &&
                    referenceImages.map((fileId) => (
                      <ReferenceImageChip
                        key={fileId}
                        fileId={fileId}
                        owner={owner}
                      />
                    ))}
                  {outputName && (
                    <Chip
                      size="xs"
                      color="success"
                      label={formatOutputFileName(outputName)}
                    />
                  )}
                  {aspectRatio && <Chip size="xs" label={aspectRatio} />}
                  {quality && (
                    <Chip
                      size="xs"
                      label={`${QUALITY_LABELS[quality]} quality`}
                    />
                  )}
                </div>
                <p
                  className={cn(
                    "text-sm text-muted-foreground dark:text-muted-foreground-night",
                    displayContext === "conversation" ? "line-clamp-3" : ""
                  )}
                >
                  {prompt}
                </p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </ActionDetailsWrapper>
  );
}
