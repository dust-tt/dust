import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import {
  ReasoningSuccessBlock,
  ThinkingBlock,
} from "@app/ui/components/actions/mcp/details/MCPToolOutputDetails";
import { isReasoningSuccessOutput, isThinkingOutput } from "@dust-tt/client";
import { ChatBubbleThoughtIcon } from "@dust-tt/sparkle";

export function MCPReasoningActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const { output } = action;

  const thinkingBlocks =
    output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  const reasoningSuccessBlocks =
    output?.filter(isReasoningSuccessOutput).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Reasoning"
      visual={ChatBubbleThoughtIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        {thinkingBlocks.map((block) => (
          <ThinkingBlock key={block.text} resource={block} />
        ))}
        {reasoningSuccessBlocks.map((block) => (
          <ReasoningSuccessBlock key={block.text} resource={block} />
        ))}
      </div>
    </ActionDetailsWrapper>
  );
}
