import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DocumentIcon,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";

const MAX_PREVIEW_LINES = 10;

export function MCPConversationCatFileDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const contentBlock = toolOutput?.find(isTextContent);
  const content = contentBlock?.text ?? null;

  if (!content) {
    return (
      <ActionDetailsWrapper
        viewType={viewType}
        actionName={
          viewType === "conversation"
            ? "Reading conversation file"
            : "Read conversation file"
        }
        visual={DocumentIcon}
      />
    );
  }

  // Skip the first line with the XML tag.
  const lines = content.split("\n").slice(1);
  const truncatedContent =
    lines.length > MAX_PREVIEW_LINES
      ? lines.join("\n") +
        `\n... (${lines.length - MAX_PREVIEW_LINES} more lines)`
      : content;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Reading conversation file"
          : "Read conversation file"
      }
      visual={DocumentIcon}
    >
      {viewType === "sidebar" && (
        <div className="flex flex-col gap-4 pl-6 pt-4">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Preview
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="py-2">
                <CodeBlock className="language-text max-h-32 overflow-y-auto">
                  {truncatedContent}
                </CodeBlock>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
