import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isGenerateImageInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { useFileMetadata } from "@app/lib/swr/files";
import { stripFileExtension } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, cn, Image01 } from "@dust-tt/sparkle";

// "high" is retained for historical actions generated before the 4K tier was
// removed from the agent-facing tool; the write path is now capped at "medium".
const QUALITY_LABELS: Record<string, string> = {
  low: "1K",
  medium: "2K",
  high: "4K",
};

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
        visual={Image01}
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
      visual={Image01}
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
              label={stripFileExtension(outputName)}
            />
          )}
          {aspectRatio && <Chip size="xs" label={aspectRatio} />}
          {quality && (
            <Chip size="xs" label={`${QUALITY_LABELS[quality]} quality`} />
          )}
        </div>
        <p
          className={cn(
            "text-sm text-muted-foreground",
            displayContext === "conversation" ? "line-clamp-3" : ""
          )}
        >
          {prompt}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}
