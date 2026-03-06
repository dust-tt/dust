import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestion } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  Checkbox,
  CheckIcon,
  Chip,
  ContentMessage,
  ContextItem,
  Input,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface MCPToolUserQuestionProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_question_required";
  };
}

type QuestionAnswerState = {
  selectedOptions: Set<number>;
  customResponse: string;
};

interface QuestionCardProps {
  question: UserQuestion;
  answerState: QuestionAnswerState;
  questionIndex: number;
  onToggleOption: (
    questionIndex: number,
    optionIndex: number,
    multiSelect: boolean
  ) => void;
  onCustomResponseChange: (questionIndex: number, value: string) => void;
}

function QuestionCard({
  question,
  answerState,
  questionIndex,
  onToggleOption,
  onCustomResponseChange,
}: QuestionCardProps) {
  const isOtherActive = answerState.customResponse.trim() !== "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Chip size="xs" label={question.header} />
        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
          {question.question}
        </span>
      </div>

      <ContextItem.List>
        {question.options.map((option, oi) => (
          <ContextItem
            key={oi}
            title={
              <span className="text-sm font-normal">{option.label}</span>
            }
            visual={
              <Checkbox
                className="mt-0.5"
                checked={
                  answerState.selectedOptions.has(oi) && !isOtherActive
                }
                onCheckedChange={() =>
                  onToggleOption(questionIndex, oi, question.multiSelect)
                }
                disabled={isOtherActive && !question.multiSelect}
              />
            }
            onClick={() =>
              onToggleOption(questionIndex, oi, question.multiSelect)
            }
          >
            <ContextItem.Description description={option.description} />
            {option.preview && (
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-foreground dark:bg-muted-night dark:text-foreground-night">
                {option.preview}
              </pre>
            )}
          </ContextItem>
        ))}
        <ContextItem
          title={<span className="text-sm font-normal">Other</span>}
          visual={
            <Checkbox
              className="mt-0.5"
              checked={isOtherActive}
              onCheckedChange={() => {
                if (isOtherActive) {
                  onCustomResponseChange(questionIndex, "");
                }
              }}
            />
          }
        >
          <Input
            placeholder="Type your response..."
            value={answerState.customResponse}
            onChange={(e) =>
              onCustomResponseChange(questionIndex, e.target.value)
            }
            name={`custom-response-${questionIndex}`}
          />
        </ContextItem>
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

  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting } = useAnswerUserQuestion({
    owner,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;
  const { questions } = blockedAction;

  const [answerStates, setAnswerStates] = useState<QuestionAnswerState[]>(() =>
    questions.map(() => ({ selectedOptions: new Set(), customResponse: "" }))
  );

  const toggleOption = useCallback(
    (questionIndex: number, optionIndex: number, multiSelect: boolean) => {
      setAnswerStates((prev) => {
        const next = [...prev];
        const current = next[questionIndex];
        const nextOptions = new Set(current.selectedOptions);
        if (multiSelect) {
          if (nextOptions.has(optionIndex)) {
            nextOptions.delete(optionIndex);
          } else {
            nextOptions.add(optionIndex);
          }
        } else {
          if (nextOptions.has(optionIndex)) {
            nextOptions.clear();
          } else {
            nextOptions.clear();
            nextOptions.add(optionIndex);
          }
        }
        // Selecting an option clears "Other" in single-select mode.
        const customResponse =
          !multiSelect && nextOptions.size > 0 ? "" : current.customResponse;
        next[questionIndex] = {
          selectedOptions: nextOptions,
          customResponse,
        };
        return next;
      });
    },
    []
  );

  const setCustomResponse = useCallback(
    (questionIndex: number, value: string) => {
      setAnswerStates((prev) => {
        const next = [...prev];
        const current = next[questionIndex];
        // Typing in "Other" clears option selection in single-select mode.
        // We check the question's multiSelect from the questions array.
        const q = questions[questionIndex];
        const selectedOptions =
          !q.multiSelect && value.trim() !== ""
            ? new Set<number>()
            : current.selectedOptions;
        next[questionIndex] = { selectedOptions, customResponse: value };
        return next;
      });
    },
    [questions]
  );

  const hasAnySelection = answerStates.some(
    (s) => s.selectedOptions.size > 0 || s.customResponse.trim() !== ""
  );

  const handleSubmit = async () => {
    setErrorMessage(null);

    const answers = answerStates.map((s) => ({
      selectedOptions: Array.from(s.selectedOptions),
      customResponse:
        s.customResponse.trim() !== "" ? s.customResponse.trim() : undefined,
    }));

    const result = await answerQuestion({
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      answers,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }
  };

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
              answerState={answerStates[qi]}
              questionIndex={qi}
              onToggleOption={toggleOption}
              onCustomResponseChange={setCustomResponse}
            />
          ))}

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
              disabled={isSubmitting || !hasAnySelection}
              onClick={() => void handleSubmit()}
            />
          </div>
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
