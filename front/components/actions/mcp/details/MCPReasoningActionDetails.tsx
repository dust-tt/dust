import { ChatBubbleThoughtIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import {
  ReasoningSuccessBlock,
  ThinkingBlock,
} from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import {
  isReasoningSuccessOutput,
  isThinkingOutput,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPReasoningActionDetails({
  action,
  defaultOpen,
}: MCPActionDetailsProps) {
  const { output } = action;

  const thinkingBlocks =
    output?.filter(isThinkingOutput).map((o) => o.resource) ?? [];

  const reasoningSuccessBlocks =
    output?.filter(isReasoningSuccessOutput).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Reasoning"
      defaultOpen={defaultOpen}
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
