import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { UserQuestionSchema } from "@app/lib/actions/types";
import { parseUserQuestionAnswer } from "@app/lib/actions/user_question";
import { removeNulls } from "@app/types/shared/utils/general";
import { Check, Icon, MessageCircle01 } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

export function MCPAskUserQuestionActionDetails({
  toolOutput,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const { t } = useLingui();
  const parsed = UserQuestionSchema.safeParse(toolParams);
  const userQuestion = parsed.success ? parsed.data : null;

  const outputText = toolOutput?.find(isTextContent)?.text ?? null;
  const { selectedLabels, removedLabels, customAnswer, isDeclined, isRanking } =
    outputText && userQuestion
      ? parseUserQuestionAnswer(outputText, userQuestion.question)
      : {
          selectedLabels: [],
          removedLabels: [],
          customAnswer: null,
          isDeclined: false,
          isRanking: false,
        };

  // A ranking answer lists the kept options in the order the user ranked them, then the removed
  // ones.
  const displayedOptions =
    userQuestion && isRanking
      ? removeNulls(
          selectedLabels.map((label) =>
            userQuestion.options.find((option) => option.label === label)
          )
        )
      : (userQuestion?.options ?? []);

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? t`Asking a question`
          : t`Asked a question`
      }
      visual={MessageCircle01}
    >
      {displayContext !== "conversation" && userQuestion && outputText && (
        <div className="flex flex-col gap-3 pl-6 pt-4">
          <div className="text-sm font-medium text-foreground">
            {userQuestion.question}
          </div>
          <div className="flex flex-col gap-1.5">
            {displayedOptions.map(({ label, description }, index) => {
              const isSelected = selectedLabels.includes(label);

              return (
                <div
                  key={index}
                  className="flex flex-col text-sm text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    {isRanking ? (
                      <span className="w-4 shrink-0 text-center text-xs">
                        {index + 1}
                      </span>
                    ) : (
                      <Icon
                        visual={Check}
                        size="xs"
                        className={isSelected ? "text-primary" : "invisible"}
                      />
                    )}
                    <span
                      className={
                        isSelected ? "font-medium text-foreground" : ""
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
            {removedLabels.map((label, index) => (
              <div
                key={`removed-${index}`}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="w-4 shrink-0" />
                <span className="line-through">{label}</span>
              </div>
            ))}
            {customAnswer && (
              <div className="flex items-center gap-2 text-sm">
                <Icon visual={Check} size="xs" className="text-primary" />
                <span className="font-medium text-foreground">
                  {customAnswer}
                </span>
              </div>
            )}
          </div>
          {isDeclined && (
            <div className="text-sm text-foreground">
              <Trans>User declined to answer</Trans>
            </div>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
