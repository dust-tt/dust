import { ActionImageIcon, cn } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isGenerateImageInputType } from "@app/lib/actions/mcp_internal_actions/types";

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
      <div
        className={cn(
          "flex flex-col gap-3",
          viewType === "conversation" ? "pl-6" : "pt-2"
        )}
      >
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
