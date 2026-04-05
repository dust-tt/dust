import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Button, Card, Checkbox, Input, Spinner } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

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
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [customResponse, setCustomResponse] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { answerQuestion, isSubmitting } = useAnswerUserQuestion({
    owner,
    onError: setErrorMessage,
  });

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const submitAnswer = useCallback(
    async (answer: UserQuestionAnswer) => {
      const result = await answerQuestion({
        conversationId,
        messageId,
        actionId: blockedAction.actionId,
        answer,
      });

      if (result.success) {
        removeCompletedAction(blockedAction.actionId);
      }
    },
    [
      conversationId,
      messageId,
      blockedAction.actionId,
      answerQuestion,
      removeCompletedAction,
    ]
  );

  const handleOptionClick = useCallback(
    (index: number) => {
      if (question.multiSelect) {
        setSelectedOptions((prev) =>
          prev.includes(index)
            ? prev.filter((i) => i !== index)
            : [...prev, index]
        );
      } else {
        void submitAnswer({ selectedOptions: [index] });
      }
    },
    [question.multiSelect, submitAnswer]
  );

  const handleCustomResponseSubmit = useCallback(() => {
    if (customResponse.trim()) {
      void submitAnswer({
        selectedOptions: [],
        customResponse: customResponse.trim(),
      });
    }
  }, [customResponse, submitAnswer]);

  const handleMultiSelectSubmit = useCallback(() => {
    if (selectedOptions.length === 0) {
      return;
    }
    void submitAnswer({ selectedOptions });
  }, [selectedOptions, submitAnswer]);

  const handleSkip = useCallback(() => {
    void submitAnswer({ selectedOptions: [] });
  }, [submitAnswer]);

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
        <span className="font-semibold">{triggeringUser?.fullName}</span> to
        answer.
      </div>
    );
  }

  return (
    <Card variant="secondary" className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
        {question.question}
      </div>
      {question.options.map((option, index) => (
        <Card
          key={index}
          variant="secondary"
          className="cursor-pointer p-3"
          onClick={() => handleOptionClick(index)}
        >
          <div className="flex items-start gap-2">
            {question.multiSelect && (
              <Checkbox
                checked={selectedOptions.includes(index)}
                onCheckedChange={() => handleOptionClick(index)}
              />
            )}
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
          </div>
        </Card>
      ))}
      <Input
        className="s-bg-background dark:s-bg-background-night"
        placeholder="Type something else..."
        value={customResponse}
        onChange={(e) => setCustomResponse(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleCustomResponseSubmit();
          }
        }}
        name="custom-response"
      />
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="flex gap-2">
        {question.multiSelect && (
          <Button
            label="Submit"
            variant="highlight"
            size="xs"
            disabled={selectedOptions.length === 0}
            onClick={handleMultiSelectSubmit}
          />
        )}
        <Button label="Skip" variant="outline" size="xs" onClick={handleSkip} />
      </div>
    </Card>
  );
}
