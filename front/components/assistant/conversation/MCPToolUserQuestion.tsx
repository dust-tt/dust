import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestion } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Button, ContentMessage, ContextItem, Input } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface MCPToolUserQuestionProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_question_required";
  };
}

interface QuestionCardProps {
  question: UserQuestion;
  questionIndex: number;
  customResponse: string;
  disabled: boolean;
  onOptionClick: (optionIndex: number) => void;
  onCustomResponseChange: (value: string) => void;
  onCustomResponseSubmit: () => void;
}

function QuestionCard({
  question,
  questionIndex,
  customResponse,
  disabled,
  onOptionClick,
  onCustomResponseChange,
  onCustomResponseSubmit,
}: QuestionCardProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
        {question.question}
      </span>
      <ContextItem.List>
        {question.options.map((option, oi) => (
          <ContextItem
            key={oi}
            visual={null}
            title={<span className="text-sm font-normal">{option.label}</span>}
            onClick={disabled ? undefined : () => onOptionClick(oi)}
          >
            <ContextItem.Description description={option.description} />
          </ContextItem>
        ))}
        <ContextItem
          visual={null}
          title={
            <Input
              placeholder="Type something else..."
              value={customResponse}
              onChange={(e) => onCustomResponseChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customResponse.trim()) {
                  onCustomResponseSubmit();
                }
              }}
              disabled={disabled}
              name={`custom-response-${questionIndex}`}
            />
          }
        />
      </ContextItem.List>
    </div>
  );
}

export function MCPToolUserQuestion({
  triggeringUser,
  owner,
  blockedAction,
}: MCPToolUserQuestionProps) {
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customResponses, setCustomResponses] = useState<string[]>(() =>
    blockedAction.questions.map(() => "")
  );

  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting } = useAnswerUserQuestion({
    owner,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;
  const { questions } = blockedAction;

  const submit = useCallback(
    async (
      answers: Array<{ selectedOptions: number[]; customResponse?: string }>
    ) => {
      const result = await answerQuestion({
        conversationId: blockedAction.conversationId,
        messageId: blockedAction.messageId,
        actionId: blockedAction.actionId,
        answers,
      });
      if (result.success) {
        removeCompletedAction(blockedAction.actionId);
      }
    },
    [answerQuestion, removeCompletedAction, blockedAction]
  );

  const handleOptionClick = useCallback(
    (questionIndex: number, optionIndex: number) => {
      void submit(
        questions.map((_, qi) => ({
          selectedOptions: qi === questionIndex ? [optionIndex] : [],
          customResponse: customResponses[qi]?.trim() || undefined,
        }))
      );
    },
    [questions, customResponses, submit]
  );

  const handleCustomResponseChange = useCallback(
    (questionIndex: number, value: string) => {
      setCustomResponses((prev) => {
        const next = [...prev];
        next[questionIndex] = value;
        return next;
      });
    },
    []
  );

  const handleCustomResponseSubmit = useCallback(
    (questionIndex: number) => {
      const text = customResponses[questionIndex]?.trim();
      if (!text) {
        return;
      }
      void submit(
        questions.map((_, qi) => ({
          selectedOptions: [],
          customResponse: qi === questionIndex ? text : customResponses[qi]?.trim() || undefined,
        }))
      );
    },
    [questions, customResponses, submit]
  );

  const handleSkip = useCallback(() => {
    void submit(questions.map(() => ({ selectedOptions: [] })));
  }, [questions, submit]);

  return (
    <ContentMessage
      variant="primary"
      className="flex w-80 min-w-[300px] flex-col gap-4 sm:min-w-[500px]"
    >
      {isTriggeredByCurrentUser ? (
        <>
          {questions.map((q, qi) => (
            <QuestionCard
              key={qi}
              question={q}
              questionIndex={qi}
              customResponse={customResponses[qi] ?? ""}
              disabled={isSubmitting}
              onOptionClick={(oi) => handleOptionClick(qi, oi)}
              onCustomResponseChange={(v) => handleCustomResponseChange(qi, v)}
              onCustomResponseSubmit={() => handleCustomResponseSubmit(qi)}
            />
          ))}

          {errorMessage && (
            <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}

          <Button
            label="Skip"
            variant="ghost"
            size="xs"
            disabled={isSubmitting}
            onClick={handleSkip}
          />
        </>
      ) : (
        <div className="text-sm text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">
            {triggeringUser?.fullName ?? "the user"}
          </span>{" "}
          to answer.
        </div>
      )}
    </ContentMessage>
  );
}
