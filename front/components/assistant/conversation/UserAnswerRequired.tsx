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
  OptionCard,
  Spinner,
} from "@dust-tt/sparkle";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface UserAnswerRequiredProps {
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_answer_required";
  };
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
}

function isPrintableKey(e: KeyboardEvent<HTMLDivElement>) {
  return (
    e.key.length === 1 && e.key !== " " && !e.altKey && !e.ctrlKey && !e.metaKey
  );
}

export function UserAnswerRequired({
  blockedAction,
  triggeringUser,
  owner,
  conversationId,
  messageId,
}: UserAnswerRequiredProps) {
  const { user } = useAuth();
  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting, errorMessage } = useAnswerUserQuestion({
    owner,
  });

  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [customResponse, setCustomResponse] = useState("");
  const [isSkipPending, setIsSkipPending] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customResponseInputRef = useRef<HTMLInputElement>(null);

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const trimmedCustomResponse = customResponse.trim();
  const isCustomResponseSelected =
    trimmedCustomResponse.length > 0 && selectedOptions.length === 0;
  const isCustomResponseActive =
    isCustomResponseFocused || isCustomResponseSelected;
  const canSubmit =
    trimmedCustomResponse.length > 0 || selectedOptions.length > 0;

  const isAnswerSubmitting = isSubmitting && !isSkipPending;
  const isSkipSubmitting = isSubmitting && isSkipPending;

  // Reset the keyboard cursor and focus when a new blocked action replaces the current one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: blockedAction.actionId is an intentional reset trigger
  useEffect(() => {
    setActiveOptionIndex(0);
    setIsCustomResponseFocused(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [blockedAction.actionId]);

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

    setIsCustomResponseFocused(false);
    setActiveOptionIndex(index);

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

  function moveActiveOption(direction: 1 | -1) {
    if (question.options.length === 0) {
      return;
    }

    setActiveOptionIndex(
      (prev) =>
        (prev + direction + question.options.length) % question.options.length
    );
  }

  function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    if (!canSubmit) {
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

  function handleActiveOptionSelection() {
    if (question.options.length === 0) {
      return;
    }

    handleOptionClick(activeOptionIndex);
  }

  function handleStartCustomResponse(character: string) {
    setIsCustomResponseFocused(true);
    setSelectedOptions([]);
    setCustomResponse((prev) => `${prev}${character}`);
    customResponseInputRef.current?.focus();
  }

  function handleCustomResponseChange(value: string) {
    setSelectedOptions([]);
    setCustomResponse(value);
  }

  function handleContainerKeyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
    ) {
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && question.multiSelect) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  }

  function handleContainerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable)
    ) {
      return;
    }

    if (isPrintableKey(e)) {
      e.preventDefault();
      handleStartCustomResponse(e.key);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIsCustomResponseFocused(false);
        moveActiveOption(1);
        containerRef.current?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        setIsCustomResponseFocused(false);
        moveActiveOption(-1);
        containerRef.current?.focus();
        break;
      case "Enter":
      case " ":
        if (e.currentTarget === e.target) {
          e.preventDefault();
          handleActiveOptionSelection();
        }
        break;
    }
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
      ref={containerRef}
      tabIndex={0}
      onKeyDownCapture={handleContainerKeyDownCapture}
      onKeyDown={handleContainerKeyDown}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-dark bg-background p-5 outline-none",
        "dark:border-dark-night dark:bg-background-night"
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
            <OptionCard
              key={index}
              label={option.label}
              description={option.description}
              counterValue={index + 1}
              selected={selectedOptions.includes(index)}
              onFocusCapture={() => {
                setIsCustomResponseFocused(false);
                setActiveOptionIndex(index);
              }}
              onMouseEnter={() => {
                setIsCustomResponseFocused(false);
                setActiveOptionIndex(index);
              }}
              className={cn(
                activeOptionIndex === index &&
                  !isCustomResponseActive &&
                  !selectedOptions.includes(index) &&
                  "bg-primary-100 dark:bg-primary-100-night"
              )}
              onClick={() => handleOptionClick(index)}
              disabled={isAnswerSubmitting}
            />
          ))}
          <Card
            variant="tertiary"
            className={cn(
              "w-full items-center gap-2 transition-colors",
              isCustomResponseActive
                ? "bg-primary-100 dark:bg-primary-100-night"
                : [
                    "bg-background dark:bg-background-night ",
                    "hover:bg-primary-100 dark:hover:bg-primary-100-night",
                  ]
            )}
          >
            <Counter
              value={question.options.length + 1}
              size="sm"
              variant="ghost"
              className="shrink-0 bg-border-darker dark:bg-border-darker-night"
            />
            <Input
              ref={customResponseInputRef}
              id={`custom-response-${blockedAction.actionId}`}
              containerClassName="flex-1"
              className={cn(
                "h-auto w-full rounded-none border-transparent bg-transparent",
                "px-0 py-0 text-sm shadow-none",
                "dark:border-transparent dark:bg-transparent",
                "focus-visible:border-transparent focus-visible:ring-0",
                "dark:focus-visible:border-transparent dark:focus-visible:ring-0"
              )}
              placeholder="Type something else"
              value={customResponse}
              onFocus={() => {
                setIsCustomResponseFocused(true);
                setSelectedOptions([]);
              }}
              onBlur={() => setIsCustomResponseFocused(false)}
              onChange={(e) => handleCustomResponseChange(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (!question.multiSelect || e.metaKey || e.ctrlKey)
                ) {
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
          disabled={!canSubmit}
          onClick={handleSubmit}
          aria-label="Send answer"
        />
      </div>
    </div>
  );
}
