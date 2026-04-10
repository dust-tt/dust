import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ArrowUpIcon,
  Button,
  Card,
  Counter,
  cn,
  Input,
  QuestionOption,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface UserQuestionRequiredProps {
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_answer_required";
  };
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
}

export function UserQuestionRequired({
  blockedAction,
  triggeringUser,
  owner,
  conversationId,
  messageId,
}: UserQuestionRequiredProps) {
  const { user } = useAuth();
  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting, errorMessage } = useAnswerUserQuestion({
    owner,
  });

  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [customResponse, setCustomResponse] = useState("");
  const [isSkipPending, setIsSkipPending] = useState(false);

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const trimmedCustomResponse = customResponse.trim();
  const isCustomResponseSelected =
    trimmedCustomResponse.length > 0 && selectedOptions.length === 0;

  const isAnswerSubmitting = isSubmitting && !isSkipPending;
  const isSkipSubmitting = isSubmitting && isSkipPending;

  async function submitAnswer(
    answer: UserQuestionAnswer,
    { isSkip = false }: { isSkip?: boolean } = {}
  ) {
    setIsSkipPending(isSkip);
    const result = await answerQuestion({
      conversationId,
      messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }

    setIsSkipPending(false);
  }
  function handleOptionClick(index: number) {
    if (isSubmitting) {
      return;
    }

    if (question.multiSelect) {
      setSelectedOptions((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
      );
      return;
    }

    setSelectedOptions([index]);
    void submitAnswer({ selectedOptions: [index] });
  }

  function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    if (!isCustomResponseSelected && selectedOptions.length === 0) {
      return;
    }

    void submitAnswer(
      selectedOptions.length > 0
        ? { selectedOptions }
        : { selectedOptions, customResponse: trimmedCustomResponse }
    );
  }

  function handleSkip() {
    if (isSubmitting) {
      return;
    }

    void submitAnswer({ selectedOptions: [] }, { isSkip: true });
  }

  if (!isTriggeredByCurrentUser) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Waiting for&nbsp;
        <span className="font-semibold">
          {triggeringUser?.fullName ?? "another user"}
        </span>
        &nbsp; to answer.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-border bg-background p-4",
        "dark:border-border-night dark:bg-background-night"
      )}
    >
      <div className="text-base font-medium leading-tight text-foreground dark:text-foreground-night">
        {question.question}
      </div>
      {isAnswerSubmitting ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {question.options.map((option, index) => (
            <QuestionOption
              key={index}
              label={option.label}
              description={option.description}
              counterValue={index + 1}
              selected={selectedOptions.includes(index)}
              selectionStyle={question.multiSelect ? "multi" : "single"}
              disabled={isSubmitting}
              onClick={() => handleOptionClick(index)}
            />
          ))}
          <Card
            variant="tertiary"
            className={cn(
              "flex w-full items-center gap-2 rounded-2xl p-3 transition-colors",
              isCustomResponseSelected &&
                "border-border dark:border-border-night",
              isCustomResponseSelected
                ? "bg-muted-background dark:bg-muted-background-night"
                : [
                    "bg-background hover:bg-muted-background/60",
                    "dark:bg-background-night",
                    "dark:hover:bg-muted-background-night/60",
                  ]
            )}
          >
            <Counter
              value={question.options.length + 1}
              size="sm"
              variant="ghost"
              className={cn(
                "shrink-0 bg-border-dark text-muted-foreground",
                "dark:bg-border-dark-night dark:text-muted-foreground-night"
              )}
            />
            <Input
              id={`custom-response-${blockedAction.actionId}`}
              containerClassName="flex-1"
              className={cn(
                "h-auto w-full rounded-none border-transparent bg-transparent",
                "px-0 py-0 text-sm shadow-none",
                "focus-visible:border-transparent focus-visible:ring-0"
              )}
              placeholder="Type something else"
              value={customResponse}
              onFocus={() => {
                setSelectedOptions([]);
              }}
              onChange={(e) => setCustomResponse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              name="custom-response"
              disabled={isSubmitting}
            />
          </Card>
        </div>
      )}
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          label="Skip"
          variant="outline"
          size="sm"
          onClick={handleSkip}
          isLoading={isSkipSubmitting}
        />
        <Button
          icon={ArrowUpIcon}
          variant="highlight"
          size="sm"
          isLoading={isAnswerSubmitting}
          disabled={
            trimmedCustomResponse.length === 0 && selectedOptions.length === 0
          }
          onClick={handleSubmit}
          aria-label="Send answer"
        />
      </div>
    </div>
  );
}
