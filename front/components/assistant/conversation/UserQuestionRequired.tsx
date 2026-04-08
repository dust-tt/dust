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
  cn,
  Input,
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
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;
  const trimmedCustomResponse = customResponse.trim();
  const hasCustomResponse = trimmedCustomResponse.length > 0;
  const hasSelectedOptions = selectedOptions.length > 0;
  const canSubmit = hasCustomResponse || hasSelectedOptions;
  const customResponseInputId = `custom-response-${blockedAction.actionId}`;

  async function submitAnswer(answer: UserQuestionAnswer) {
    const result = await answerQuestion({
      conversationId,
      messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }
  }

  function handleOptionClick(index: number) {
    setCustomResponse("");

    if (question.multiSelect) {
      setSelectedOptions((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      );
      return;
    }

    setSelectedOptions((prev) => (prev[0] === index ? [] : [index]));
  }

  function handleCustomResponseChange(value: string) {
    setSelectedOptions([]);
    setCustomResponse(value);
  }

  function handleSubmit() {
    if (hasCustomResponse) {
      void submitAnswer({
        selectedOptions: [],
        customResponse: trimmedCustomResponse,
      });
      return;
    }

    if (!hasSelectedOptions) {
      return;
    }

    void submitAnswer({ selectedOptions });
  }

  function handleSkip() {
    void submitAnswer({ selectedOptions: [] });
  }

  if (isSubmitting) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!isTriggeredByCurrentUser) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Waiting for{" "}
        <span className="font-semibold">
          {triggeringUser?.fullName ?? "another user"}
        </span>{" "}
        to answer.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-background p-5 dark:border-border-night dark:bg-background-night">
      <div className="text-base font-medium leading-tight text-foreground dark:text-foreground-night">
        {question.question}
      </div>
      <div className="flex flex-col gap-0">
        {question.options.map((option, index) => {
          const isSelected = selectedOptions.includes(index);

          return (
            <Card
              key={index}
              variant="tertiary"
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-left transition-colors",
                isSelected
                  ? "bg-muted-background dark:bg-muted-background-night"
                  : [
                      "bg-background hover:bg-muted-background/60",
                      "dark:bg-background-night",
                      "dark:hover:bg-muted-background-night/60",
                    ]
              )}
              onClick={() => handleOptionClick(index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOptionClick(index);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-150 text-xs font-semibold text-primary-700 dark:bg-primary-800 dark:text-primary-300">
                {index + 1}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    {option.description}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
        <Card
          variant="tertiary"
          className={cn(
            "flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 transition-colors",
            isCustomResponseFocused
              ? "bg-muted-background dark:bg-muted-background-night"
              : [
                  "bg-background hover:bg-muted-background/60",
                  "dark:bg-background-night",
                  "dark:hover:bg-muted-background-night/60",
                ]
          )}
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-150 text-xs font-semibold text-primary-700 dark:bg-primary-800 dark:text-primary-300"
          >
            {question.options.length + 1}
          </div>
          <Input
            id={customResponseInputId}
            containerClassName="flex-1"
            className="h-auto w-full rounded-none border-transparent bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
            placeholder="Type something else"
            value={customResponse}
            onFocus={() => {
              setSelectedOptions([]);
              setIsCustomResponseFocused(true);
            }}
            onBlur={() => setIsCustomResponseFocused(false)}
            onChange={(e) => handleCustomResponseChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            name="custom-response"
          />
        </Card>
      </div>
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button label="Skip" variant="outline" size="sm" onClick={handleSkip} />
        <Button
          icon={ArrowUpIcon}
          variant="highlight"
          size="sm"
          disabled={!canSubmit}
          onClick={handleSubmit}
          aria-label="Send answer"
        />
      </div>
    </div>
  );
}
