import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { UserQuestionSchema } from "@app/lib/actions/types";
import {
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  Icon,
} from "@dust-tt/sparkle";

export function MCPAskUserQuestionActionDetails({
  toolOutput,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const parsed = UserQuestionSchema.safeParse(toolParams);
  const userQuestion = parsed.success ? parsed.data : null;

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
      {displayContext !== "conversation" && userQuestion && (
        <div className="flex flex-col gap-3 pl-6 pt-4">
          <div className="text-sm font-medium text-foreground dark:text-foreground-night">
            {userQuestion.question}
          </div>
          <div className="flex flex-col gap-1">
            {userQuestion.options.map(({ label, description }, index) => {
              const isSelected =
                answerText !== null && answerText.includes(label);

              return (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night"
                >
                  {answerText && (
                    <Icon
                      visual={CheckIcon}
                      size="xs"
                      className={
                        isSelected
                          ? "text-primary dark:text-primary-night"
                          : "invisible"
                      }
                    />
                  )}
                  <span
                    className={
                      isSelected
                        ? "font-medium text-foreground dark:text-foreground-night"
                        : ""
                    }
                  >
                    {label}
                  </span>
                  {description && (
                    <span className="text-xs">{description}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
