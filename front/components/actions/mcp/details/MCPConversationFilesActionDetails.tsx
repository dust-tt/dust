import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  File02,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

const MAX_PREVIEW_LINES = 10;

export function MCPConversationCatFileDetails({
  toolOutput,
  displayContext,
}: ToolExecutionDetailsProps) {
  const { t } = useLingui();
  const contentBlock = toolOutput?.find(isTextContent);
  const content = contentBlock?.text ?? null;

  const actionName =
    displayContext === "conversation"
      ? t`Reading conversation file`
      : t`Read conversation file`;

  if (!content) {
    return (
      <ActionDetailsWrapper
        displayContext={displayContext}
        actionName={actionName}
        visual={File02}
      />
    );
  }

  // Skip the first line with the XML tag.
  const lines = content.split("\n").slice(1);
  const remainingLineCount = lines.length - MAX_PREVIEW_LINES;
  const truncatedContent =
    lines.length > MAX_PREVIEW_LINES
      ? `${lines.join("\n")}\n${t`... (${plural(remainingLineCount, { one: "# more line", other: "# more lines" })})`}`
      : content;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={File02}
    >
      {displayContext !== "conversation" && (
        <div className="flex flex-col gap-4 pl-6 pt-4">
          {displayContext === "sidebar-single-action" ? (
            <div>
              <span className="font-medium text-foreground">
                <Trans>Preview</Trans>
              </span>
              <div className="py-2">
                <CodeBlock className="language-text max-h-32 overflow-y-auto">
                  {truncatedContent}
                </CodeBlock>
              </div>
            </div>
          ) : (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger>
                <span className="text-sm font-semibold text-foreground">
                  <Trans>Preview</Trans>
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
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
