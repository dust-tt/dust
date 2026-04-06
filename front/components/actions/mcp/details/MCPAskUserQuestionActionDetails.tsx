import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { UserQuestionSchema } from "@app/lib/actions/types";
import { ChatBubbleBottomCenterTextIcon } from "@dust-tt/sparkle";

export function MCPAskUserQuestionActionDetails({
  toolOutput,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const parsed = UserQuestionSchema.safeParse(toolParams);
  const question = parsed.success ? parsed.data.question : null;

  const answerText = toolOutput?.find(isTextContent)?.text ?? null;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? "Asking a question"
          : "Asked a question"
      }
      visual={ChatBubbleBottomCenterTextIcon}
    >
      {displayContext !== "conversation" && (
        <div className="flex flex-col gap-2 pl-6 pt-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
          {question && <div className="font-medium">{question}</div>}
          {answerText && <div>{answerText}</div>}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
