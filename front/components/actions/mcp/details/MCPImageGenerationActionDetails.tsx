import { ActionImageIcon, cn } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isEditImageInputType,
  isGenerateImageInputType,
} from "@app/lib/actions/mcp_internal_actions/types";

export function MCPImageGenerationActionDetails({
  viewType,
  toolParams,
}: ToolExecutionDetailsProps) {
  if (!isGenerateImageInputType(toolParams)) {
    return (
      <ActionDetailsWrapper
        viewType={viewType}
        actionName={
          viewType === "conversation" ? "Generating image" : "Generate image"
        }
        visual={ActionImageIcon}
      />
    );
  }

  const { prompt } = toolParams;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Generating image" : "Generate image"
      }
      visual={ActionImageIcon}
    >
      <div className="flex flex-col gap-3 pl-6 pt-4">
        <p
          className={cn(
            "text-sm text-muted-foreground dark:text-muted-foreground-night",
            viewType === "conversation" ? "line-clamp-3" : ""
          )}
        >
          {prompt}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}

export function MCPImageEditingActionDetails({
  viewType,
  toolParams,
}: ToolExecutionDetailsProps) {
  if (!isEditImageInputType(toolParams)) {
    return (
      <ActionDetailsWrapper
        viewType={viewType}
        actionName={
          viewType === "conversation" ? "Editing image" : "Edit image"
        }
        visual={ActionImageIcon}
      />
    );
  }

  const { editPrompt } = toolParams;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Editing image" : "Edit image"}
      visual={ActionImageIcon}
    >
      <div className="flex flex-col gap-3 pl-6 pt-4">
        <p
          className={cn(
            "text-sm text-muted-foreground dark:text-muted-foreground-night",
            viewType === "conversation" ? "line-clamp-3" : ""
          )}
        >
          {editPrompt}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}
