import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { UserQuestionSchema } from "@app/lib/actions/types";
import { parseUserQuestionAnswer } from "@app/lib/actions/user_question";
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

  const outputText = toolOutput?.find(isTextContent)?.text ?? null;
  const { selectedLabels, customAnswer, isDeclined } =
    outputText && userQuestion
      ? parseUserQuestionAnswer(outputText, userQuestion.question)
      : { selectedLabels: [], customAnswer: null, isDeclined: false };

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
      {displayContext !== "conversation" && userQuestion && outputText && (
        <div className="flex flex-col gap-3 pl-6 pt-4">
          <div className="text-sm font-medium text-foreground dark:text-foreground-night">
            {userQuestion.question}
          </div>
          <div className="flex flex-col gap-1.5">
            {userQuestion.options.map(({ label, description }, index) => {
              const isSelected = selectedLabels.includes(label);

              return (
                <div
                  key={index}
                  className="flex flex-col text-sm text-muted-foreground dark:text-muted-foreground-night"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      visual={CheckIcon}
                      size="xs"
                      className={
                        isSelected
                          ? "text-primary dark:text-primary-night"
                          : "invisible"
                      }
                    />
                    <span
                      className={
                        isSelected
                          ? "font-medium text-foreground dark:text-foreground-night"
                          : ""
                      }
                    >
                      {label}
                    </span>
                  </div>
                  {description && (
                    <span className="ml-6 text-xs">{description}</span>
                  )}
                </div>
              );
            })}
            {customAnswer && (
              <div className="flex items-center gap-2 text-sm">
                <Icon
                  visual={CheckIcon}
                  size="xs"
                  className="text-primary dark:text-primary-night"
                />
                <span className="font-medium text-foreground dark:text-foreground-night">
                  {customAnswer}
                </span>
              </div>
            )}
          </div>
          {isDeclined && (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              User declined to answer
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
