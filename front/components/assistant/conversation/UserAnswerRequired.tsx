import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import { useUserAnswerDraft } from "@app/hooks/useUserAnswerDraft";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import type {
  UserQuestion,
  UserQuestionAnswer,
  UserQuestionOption,
} from "@app/lib/actions/types";
import { isRankingQuestion } from "@app/lib/actions/user_question";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isEditableTarget } from "@app/lib/utils/dom";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ArrowUp,
  Button,
  ChevronSelectorVertical,
  cn,
  Icon,
  Markdown,
  OptionCard,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface UserAnswerRequiredProps {
  blockedAction: AgentLoopBlockedToolExecution & {
    status: "blocked_user_answer_required";
  };
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  retryHandler: () => Promise<void>;
}

type SubmissionState = {
  kind: "answer" | "skip";
  phase: "pending" | "exiting";
} | null;

type QuestionLayout =
  | "list"
  | "columns"
  | "preview_pane"
  | "yes_no"
  | "chips"
  | "ranking";

/**
 * @cc [owner:aubin-tchoi,label:product] compare-layout
 * A question MUST render with its `format`'s layout only when all of that format's constraints
 * hold, and as the default list otherwise, including when it has no `format` at all (stored before
 * the field existed) or one this client does not know:
 * - `compare`: single select, as columns with exactly 2 options and as an option list with a
 *   preview pane with 3 or more.
 * - `yes_no`: single select with exactly 2 options, as two buttons.
 * - `chips`: no option has a description, as wrapping pills.
 * - `ranking`: `isRankingQuestion` holds, as a list the user reorders.
 */
function getQuestionLayout(question: UserQuestion): QuestionLayout {
  switch (question.format) {
    case "list":
      return "list";
    case "compare":
      if (question.multiSelect || question.options.length < 2) {
        return "list";
      }
      return question.options.length === 2 ? "columns" : "preview_pane";
    case "yes_no":
      return !question.multiSelect && question.options.length === 2
        ? "yes_no"
        : "list";
    case "chips":
      return question.options.every((option) => !option.description)
        ? "chips"
        : "list";
    case "ranking":
      return isRankingQuestion(question) ? "ranking" : "list";
    default:
      assertNeverAndIgnore(question.format);
      return "list";
  }
}

function isPrintableKey(e: KeyboardEvent<HTMLDivElement>) {
  return (
    e.key.length === 1 && e.key !== " " && !e.altKey && !e.ctrlKey && !e.metaKey
  );
}

const RECOMMENDED_SUFFIX = "(Recommended)";

// The recommended answer is shown by the button style, so its label drops the suffix.
function getYesNoButton(option: UserQuestionOption) {
  const isRecommended = option.label.endsWith(RECOMMENDED_SUFFIX);

  return {
    label: isRecommended
      ? option.label.slice(0, -RECOMMENDED_SUFFIX.length).trimEnd()
      : option.label,
    isRecommended,
  };
}

// Yes/no buttons answer with 1 and 2, and with Y and N when their labels are literally Yes and No.
function getYesNoShortcutIndex(
  key: string,
  options: UserQuestionOption[]
): number | null {
  if (key === "1" || key === "2") {
    return Number(key) - 1;
  }

  const labels = options.map((option) =>
    getYesNoButton(option).label.toLowerCase()
  );
  if (!labels.includes("yes") || !labels.includes("no")) {
    return null;
  }

  switch (key.toLowerCase()) {
    case "y":
      return labels.indexOf("yes");
    case "n":
      return labels.indexOf("no");
    default:
      return null;
  }
}

// Columns and chips lay options out side by side, so left and right arrows also move between
// them. Yes/no buttons have no active option: they are reached with Tab or their shortcuts.
function getArrowKeyDirection(
  key: string,
  layout: QuestionLayout
): 1 | -1 | null {
  if (layout === "yes_no") {
    return null;
  }
  const isHorizontal = layout === "columns" || layout === "chips";
  if (key === "ArrowDown" || (isHorizontal && key === "ArrowRight")) {
    return 1;
  }
  if (key === "ArrowUp" || (isHorizontal && key === "ArrowLeft")) {
    return -1;
  }
  return null;
}

function OptionPreviewPane({ option }: { option: UserQuestionOption }) {
  if (!option.description && !option.preview) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-muted-background px-4 py-3">
      {option.description && (
        <div className="text-sm text-muted-foreground">
          {option.description}
        </div>
      )}
      {option.preview && (
        <div className="max-h-64 overflow-y-auto">
          <Markdown content={option.preview} forcedTextSize="text-sm" />
        </div>
      )}
    </div>
  );
}

function RankedOption({
  optionIndex,
  children,
}: {
  optionIndex: number;
  children: ReactNode;
}) {
  const dragControls = useDragControls();
  const shouldReduceMotion = useReducedMotion();

  // A mouse drags the whole card. Touch only drags from the handle, so that swiping the card still
  // scrolls the page.
  return (
    <Reorder.Item
      as="div"
      value={optionIndex}
      dragListener={false}
      dragControls={dragControls}
      transition={shouldReduceMotion ? { duration: 0 } : undefined}
      className="relative select-none"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") {
          dragControls.start(e);
        }
      }}
    >
      {children}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex cursor-grab touch-none items-center px-3 text-faint active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") {
            dragControls.start(e);
          }
        }}
      >
        <Icon visual={ChevronSelectorVertical} size="sm" />
      </div>
    </Reorder.Item>
  );
}

/**
 * @cc [owner:aubin-tchoi,label:product] preview-pane-explicit-submit
 * In the preview pane layout, picking an option MUST select it without submitting the answer, so
 * that users without hover (touch devices) can preview every option first. The selected option is
 * then submitted with the send button or Cmd/Ctrl+Enter. In the other single-select layouts,
 * picking an option submits it right away.
 */
export function UserAnswerRequired({
  blockedAction,
  triggeringUser,
  owner,
  retryHandler,
}: UserAnswerRequiredProps) {
  const { t } = useLingui();
  const { user } = useAuth();
  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, errorMessage } = useAnswerUserQuestion({ owner });

  const answerDraft = useUserAnswerDraft({
    multiSelect: blockedAction.question.multiSelect,
  });
  const [submission, setSubmission] = useState<SubmissionState>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const [ranking, setRanking] = useState(() =>
    blockedAction.question.options.map((_, index) => index)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const customResponseInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { question } = blockedAction;
  const layout = getQuestionLayout(question);
  const requiresExplicitSubmit =
    question.multiSelect || layout === "preview_pane" || layout === "ranking";
  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: blockedAction.userId,
    currentUserId: user?.sId,
  });

  const isCustomResponseActive =
    isCustomResponseFocused ||
    answerDraft.answerToSubmit?.customResponse !== undefined;

  const isSubmitting = submission !== null;

  // A ranking can be submitted as is: without a custom response, the answer is the current order.
  const answerToSubmit =
    layout === "ranking"
      ? (answerDraft.answerToSubmit ?? { selectedOptions: ranking })
      : answerDraft.answerToSubmit;

  // Reset the keyboard cursor and focus when a new blocked action replaces the current one.
  useEffect(() => {
    setActiveOptionIndex(0);
    setIsCustomResponseFocused(false);
    setIsKeyboardNavigating(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [blockedAction.actionId]);

  async function submitAnswer(
    answer: UserQuestionAnswer,
    { isSkip = false }: { isSkip?: boolean } = {}
  ) {
    // Move focus out of the controls before disabling and hiding them.
    containerRef.current?.focus({ preventScroll: true });
    const submissionKind = isSkip ? "skip" : "answer";
    setSubmission({ kind: submissionKind, phase: "pending" });

    // Submit against the action's own conversation/message: for a sub-agent
    // question these are the child's ids (the action lives in the child
    // conversation). For a direct question they equal the current conversation.
    const result = await answerQuestion({
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      // Resume the agent run. For a sub-agent question this also relaunches the
      // blocked parent run (the child retry is a no-op once the answer is in).
      await retryHandler();

      if (shouldReduceMotion) {
        removeCompletedAction(blockedAction.actionId);
      } else {
        // Keep the submission state visible until the exit animation removes the card.
        setSubmission({ kind: submissionKind, phase: "exiting" });
      }
    } else {
      setSubmission(null);
    }
  }

  function activateOption(index: number) {
    setIsCustomResponseFocused(false);
    setActiveOptionIndex(index);
  }

  function handleOptionClick(index: number) {
    if (isSubmitting) {
      return;
    }

    activateOption(index);

    const answer = answerDraft.selectOption(index);

    if (answer !== null && !requiresExplicitSubmit) {
      void submitAnswer(answer);
    }
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
    if (isSubmitting || answerToSubmit === null) {
      return;
    }

    void submitAnswer(answerToSubmit);
  }

  function handleReorder(nextRanking: number[]) {
    setRanking(nextRanking);
    answerDraft.rankOptions(nextRanking);
  }

  // In the ranking layout, the active option index is a position in the ranking.
  function moveActiveRankedOption(direction: 1 | -1) {
    const targetPosition = activeOptionIndex + direction;
    if (targetPosition < 0 || targetPosition >= ranking.length) {
      return;
    }

    const nextRanking = [...ranking];
    nextRanking[activeOptionIndex] = ranking[targetPosition];
    nextRanking[targetPosition] = ranking[activeOptionIndex];
    handleReorder(nextRanking);
    setActiveOptionIndex(targetPosition);
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
    answerDraft.appendCustomResponse(character);
    customResponseInputRef.current?.focus();
  }

  function handleCustomResponseKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (
      e.key === "Backspace" &&
      answerDraft.customResponse.length === 0 &&
      question.options.length > 0
    ) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      setIsCustomResponseFocused(false);
      setActiveOptionIndex(question.options.length - 1);
      containerRef.current?.focus();
      return;
    }

    if (
      e.key === "Enter" &&
      (!question.multiSelect || e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      handleSubmit();
    }
  }

  function handleContainerKeyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsKeyboardNavigating(true);
      handleSkip();
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if (
      (e.metaKey || e.ctrlKey) &&
      e.key === "Enter" &&
      requiresExplicitSubmit
    ) {
      e.preventDefault();
      e.stopPropagation();
      setIsKeyboardNavigating(true);
      handleSubmit();
    }
  }

  function handleContainerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) {
      return;
    }

    if (isPrintableKey(e)) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      const yesNoShortcutIndex =
        layout === "yes_no"
          ? getYesNoShortcutIndex(e.key, question.options)
          : null;
      if (yesNoShortcutIndex !== null) {
        handleOptionClick(yesNoShortcutIndex);
      } else {
        handleStartCustomResponse(e.key);
      }
      return;
    }

    const arrowKeyDirection = getArrowKeyDirection(e.key, layout);
    if (arrowKeyDirection !== null) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      setIsCustomResponseFocused(false);
      if (layout === "ranking" && e.altKey) {
        moveActiveRankedOption(arrowKeyDirection);
      } else {
        moveActiveOption(arrowKeyDirection);
      }
      containerRef.current?.focus();
      return;
    }

    switch (e.key) {
      case "Enter":
      case " ":
        if (
          e.currentTarget === e.target &&
          layout !== "yes_no" &&
          layout !== "ranking"
        ) {
          e.preventDefault();
          setIsKeyboardNavigating(true);
          handleActiveOptionSelection();
        }
        break;
    }
  }

  if (!canCurrentUserRespond) {
    const triggeringUserName = triggeringUser?.fullName;
    return (
      <div className="text-sm text-muted-foreground">
        {triggeringUserName ? (
          <Trans>
            Waiting for&nbsp;
            <span className="font-semibold">{triggeringUserName}</span>
            &nbsp; to answer.
          </Trans>
        ) : (
          <Trans>
            Waiting for&nbsp;
            <span className="font-semibold">another user</span>
            &nbsp; to answer.
          </Trans>
        )}
      </div>
    );
  }

  const optionCards = question.options.map((option, index) => (
    <OptionCard
      key={index}
      label={option.label}
      // The preview pane shows the active option's description next to the list.
      description={layout === "preview_pane" ? null : option.description}
      preview={
        layout === "columns" && option.preview ? (
          <Markdown content={option.preview} forcedTextSize="text-sm" />
        ) : undefined
      }
      // In the preview pane, leading radios keep the list visually apart from the pane.
      counterValue={layout === "preview_pane" ? undefined : index + 1}
      selected={answerDraft.selectedOptions.includes(index)}
      disableHover={isKeyboardNavigating}
      selectionIndicator={question.multiSelect ? "checkbox" : "radio"}
      selectionIndicatorPosition={layout === "preview_pane" ? "start" : "end"}
      onFocusCapture={() => activateOption(index)}
      onMouseEnter={() => activateOption(index)}
      className={cn(
        activeOptionIndex === index &&
          !isCustomResponseActive &&
          !answerDraft.selectedOptions.includes(index) &&
          "bg-primary-100",
        isKeyboardNavigating && "cursor-none"
      )}
      onClick={() => handleOptionClick(index)}
      disabled={isSubmitting}
    />
  ));

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-busy={isSubmitting}
      onKeyDownCapture={handleContainerKeyDownCapture}
      onKeyDown={handleContainerKeyDown}
      onMouseMove={() => setIsKeyboardNavigating(false)}
      onAnimationEnd={(event) => {
        if (
          submission?.phase === "exiting" &&
          event.currentTarget === event.target
        ) {
          removeCompletedAction(blockedAction.actionId);
        }
      }}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-dark bg-background p-5 outline-hidden",
        "ease-enter motion-reduce:animate-none",
        submission?.phase === "exiting" &&
          "animate-out fill-mode-forwards fade-out-0 duration-exit",
        isKeyboardNavigating && "cursor-none"
      )}
    >
      <div className="text-base font-medium leading-tight text-foreground">
        {question.question}
      </div>
      <div className="relative min-h-16">
        <div
          aria-hidden={isSubmitting}
          className={cn(
            "flex flex-col gap-2 @container transition-opacity ease-enter motion-reduce:transition-none",
            isSubmitting
              ? "opacity-0 duration-exit"
              : "opacity-100 duration-enter"
          )}
        >
          {layout === "list" && optionCards}
          {layout === "columns" && (
            <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
              {optionCards}
            </div>
          )}
          {layout === "preview_pane" && (
            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-[2fr_3fr]">
              <div className="flex flex-col gap-2">{optionCards}</div>
              <OptionPreviewPane option={question.options[activeOptionIndex]} />
            </div>
          )}
          {layout === "yes_no" && (
            <div className="grid grid-cols-2 gap-2">
              {question.options.map((option, index) => {
                const { label, isRecommended } = getYesNoButton(option);

                return (
                  <Button
                    key={index}
                    label={label}
                    variant={isRecommended ? "primary" : "outline"}
                    size="md"
                    className="w-full"
                    onClick={() => handleOptionClick(index)}
                    disabled={isSubmitting}
                  />
                );
              })}
            </div>
          )}
          {layout === "ranking" && (
            <Reorder.Group
              as="div"
              axis="y"
              values={ranking}
              onReorder={handleReorder}
              className="flex flex-col gap-2"
            >
              {ranking.map((optionIndex, position) => (
                <RankedOption key={optionIndex} optionIndex={optionIndex}>
                  <OptionCard
                    label={question.options[optionIndex].label}
                    description={question.options[optionIndex].description}
                    counterValue={position + 1}
                    disableHover={isKeyboardNavigating}
                    onMouseEnter={() => activateOption(position)}
                    className={cn(
                      "pr-10",
                      activeOptionIndex === position &&
                        !isCustomResponseActive &&
                        "bg-primary-100",
                      isKeyboardNavigating && "cursor-none"
                    )}
                    disabled={isSubmitting}
                  />
                </RankedOption>
              ))}
            </Reorder.Group>
          )}
          {layout === "chips" && (
            <div className="flex flex-wrap gap-2">
              {question.options.map((option, index) => {
                const isSelected = answerDraft.selectedOptions.includes(index);

                return (
                  <Button
                    key={index}
                    label={option.label}
                    variant={isSelected ? "primary" : "outline"}
                    size="sm"
                    isRounded
                    aria-pressed={isSelected}
                    onFocus={() => activateOption(index)}
                    onMouseEnter={() => activateOption(index)}
                    // The list's active background does not show on outline buttons, so the
                    // keyboard cursor shows as a ring.
                    className={cn(
                      isKeyboardNavigating &&
                        activeOptionIndex === index &&
                        !isCustomResponseActive &&
                        "ring-2 ring-inset ring-ring"
                    )}
                    onClick={() => handleOptionClick(index)}
                    disabled={isSubmitting}
                  />
                );
              })}
            </div>
          )}
          <OptionCard
            type="input"
            selected={isCustomResponseActive}
            disableHover={isKeyboardNavigating}
            className={cn(isKeyboardNavigating && "cursor-none")}
            inputRef={customResponseInputRef}
            id={`custom-response-${blockedAction.actionId}`}
            name="custom-response"
            placeholder={t`Tell the agent what to do differently`}
            value={answerDraft.customResponse}
            disabled={isSubmitting}
            onFocus={() => {
              setIsCustomResponseFocused(true);
              answerDraft.selectCustomResponse();
            }}
            onBlur={() => setIsCustomResponseFocused(false)}
            onChange={(value) => answerDraft.updateCustomResponse(value)}
            onKeyDown={handleCustomResponseKeyDown}
          />
        </div>
        <div
          role={isSubmitting ? "status" : undefined}
          aria-hidden={!isSubmitting}
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity ease-enter motion-reduce:transition-none",
            isSubmitting
              ? "opacity-100 duration-exit"
              : "pointer-events-none opacity-0 duration-enter"
          )}
        >
          <Spinner size="lg" />
          <span className="sr-only">
            {submission?.kind === "skip"
              ? t`Skipping question`
              : t`Submitting answer`}
          </span>
        </div>
      </div>
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          label={t`Skip`}
          variant="outline"
          size="sm"
          onClick={handleSkip}
          isLoading={submission?.kind === "skip"}
          disabled={isSubmitting}
        />
        <Button
          icon={ArrowUp}
          variant="highlight"
          size="sm"
          isLoading={submission?.kind === "answer"}
          disabled={isSubmitting || answerToSubmit === null}
          onClick={handleSubmit}
          aria-label={t`Send answer`}
          className="rounded-full"
        />
      </div>
    </div>
  );
}
