import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  Checkbox,
  CheckIcon,
  ContentMessage,
  Input,
} from "@dust-tt/sparkle";
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
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { answerQuestion, isSubmitting } = useAnswerUserQuestion({
    owner,
    onError: setErrorMessage,
  });

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const handleOptionToggle = useCallback(
    (index: number) => {
      if (question.multiSelect) {
        setSelectedOptions((prev) =>
          prev.includes(index)
            ? prev.filter((i) => i !== index)
            : [...prev, index]
        );
      } else {
        setSelectedOptions([index]);
        setShowOtherInput(false);
        setCustomResponse("");
      }
    },
    [question.multiSelect]
  );

  const handleOtherToggle = useCallback(() => {
    if (!question.multiSelect) {
      setSelectedOptions([]);
    }
    setShowOtherInput((prev) => !prev);
    if (showOtherInput) {
      setCustomResponse("");
    }
  }, [question.multiSelect, showOtherInput]);

  const handleSubmit = useCallback(async () => {
    if (selectedOptions.length === 0 && !customResponse.trim()) {
      return;
    }

    const answer: UserQuestionAnswer = {
      selectedOptions,
      ...(customResponse.trim()
        ? { customResponse: customResponse.trim() }
        : {}),
    };

    const result = await answerQuestion({
      conversationId,
      messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }
  }, [
    selectedOptions,
    customResponse,
    conversationId,
    messageId,
    blockedAction.actionId,
    answerQuestion,
    removeCompletedAction,
  ]);

  const hasSelection =
    selectedOptions.length > 0 || customResponse.trim().length > 0;

  return (
    <ContentMessage
      title={question.question}
      variant="primary"
      className="flex w-full flex-col gap-3 sm:w-80 sm:min-w-[500px]"
      icon={ChatBubbleBottomCenterTextIcon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          <div className="flex flex-col gap-2">
            {question.options.map((option, index) => (
              <label
                key={index}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 hover:bg-muted dark:border-border-night dark:hover:bg-muted-night"
              >
                <Checkbox
                  checked={selectedOptions.includes(index)}
                  onCheckedChange={() => handleOptionToggle(index)}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      {option.description}
                    </span>
                  )}
                </div>
              </label>
            ))}
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 hover:bg-muted dark:border-border-night dark:hover:bg-muted-night">
              <Checkbox
                checked={showOtherInput}
                onCheckedChange={() => handleOtherToggle()}
              />
              <span className="text-sm font-medium">Other</span>
            </label>
            {showOtherInput && (
              <Input
                placeholder="Type your answer..."
                value={customResponse}
                onChange={(e) => setCustomResponse(e.target.value)}
                name="custom-response"
              />
            )}
          </div>
          {errorMessage && (
            <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              label="Submit"
              variant="highlight"
              size="xs"
              icon={CheckIcon}
              disabled={isSubmitting || !hasSelection}
              onClick={() => void handleSubmit()}
            />
          </div>
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          answer.
        </div>
      )}
    </ContentMessage>
  );
}
