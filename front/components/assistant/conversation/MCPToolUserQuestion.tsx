import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  Checkbox,
  CheckIcon,
  ContentMessage,
  Input,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

interface MCPToolUserQuestionProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_question_required";
  };
}

export function MCPToolUserQuestion({
  triggeringUser,
  owner,
  blockedAction,
}: MCPToolUserQuestionProps) {
  const { user } = useAuth();
  const [selectedOptions, setSelectedOptions] = useState<Set<number>>(
    new Set()
  );
  const [customResponse, setCustomResponse] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting } = useAnswerUserQuestion({
    owner,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => blockedAction.userId === user?.sId,
    [blockedAction.userId, user?.sId]
  );

  const { question, options, allowMultiple } = blockedAction;

  const toggleOption = useCallback(
    (index: number) => {
      setSelectedOptions((prev) => {
        const next = new Set(prev);
        if (allowMultiple) {
          if (next.has(index)) {
            next.delete(index);
          } else {
            next.add(index);
          }
        } else {
          // Single select: clear all and set the new one (or toggle off).
          if (next.has(index)) {
            next.clear();
          } else {
            next.clear();
            next.add(index);
          }
        }
        return next;
      });
    },
    [allowMultiple]
  );

  const hasSelection = selectedOptions.size > 0 || customResponse.trim() !== "";

  const handleSubmit = async () => {
    setErrorMessage(null);

    const result = await answerQuestion({
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      selectedOptions:
        selectedOptions.size > 0 ? Array.from(selectedOptions) : undefined,
      customResponse:
        customResponse.trim() !== "" ? customResponse.trim() : undefined,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }
  };

  return (
    <ContentMessage
      title={question}
      variant="primary"
      className="flex w-80 min-w-[300px] flex-col gap-3 sm:min-w-[500px]"
    >
      {isTriggeredByCurrentUser ? (
        <>
          <div className="flex flex-col gap-2">
            {options.map((option, index) => (
              <label
                key={index}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-separator px-3 py-2 transition-colors hover:bg-muted dark:border-separator-night dark:hover:bg-muted-night"
                onClick={() => toggleOption(index)}
              >
                <Checkbox
                  checked={selectedOptions.has(index)}
                  onCheckedChange={() => toggleOption(index)}
                  className="mt-0.5"
                />
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
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Or type a custom response:
            </span>
            <Input
              placeholder="Type your response..."
              value={customResponse}
              onChange={(e) => setCustomResponse(e.target.value)}
              name="custom-response"
            />
          </div>

          {errorMessage && (
            <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-row justify-end">
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
