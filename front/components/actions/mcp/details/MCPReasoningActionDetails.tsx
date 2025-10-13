import { ChatBubbleThoughtIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import {
  ReasoningSuccessBlock,
  ThinkingBlock,
} from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isReasoningSuccessOutput,
  isThinkingOutput,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPReasoningActionDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const thinkingBlocks =
    toolOutput?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  const reasoningSuccessBlocks =
    toolOutput?.filter(isReasoningSuccessOutput).map((o) => o.resource) ?? [];

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
