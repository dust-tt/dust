"use client";

import { useAcademyQuiz } from "@app/hooks/useAcademyQuiz";
import {
  useAcademyContentProgress,
  useRecordQuizAttempt,
} from "@app/lib/swr/academy";
import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import {
  Button,
  ConversationMessageAvatar,
  ConversationMessageContainer,
  ConversationMessageContent,
  ConversationMessageTitle,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

interface AcademyQuizProps {
  contentType: "course" | "lesson" | "chapter";
  title: string;
  content: string;
  userName?: string;
  contentSlug?: string;
  courseSlug?: string;
  browserId?: string | null;
}

const TOTAL_QUESTIONS = 5;
const PASSING_SCORE = 3;
const AGENT_NAME = "DustMentor";

export function AcademyQuiz({
  contentType,
  title,
  content,
  userName,
  contentSlug,
  courseSlug,
  browserId,
}: AcademyQuizProps) {
  const { recordAttempt } = useRecordQuizAttempt({ browserId });

  const { progress } = useAcademyContentProgress({
    contentType,
    contentSlug: contentSlug ?? "",
    disabled: !contentSlug,
    browserId,
  });

  const handleQuizComplete = useCallback(
    (correctAnswers: number, totalQuestions: number) => {
      if (contentSlug) {
        void recordAttempt({
          contentType,
          contentSlug,
          courseSlug,
          correctAnswers,
          totalQuestions,
        });
      }
    },
    [contentSlug, contentType, courseSlug, recordAttempt]
  );

  const {
    messages,
    isLoading,
    error,
    correctAnswers,
    totalQuestions,
    isCompleted,
    startQuiz,
    submitAnswer,
    resetQuiz,
  } = useAcademyQuiz({
    contentType,
    title,
    content,
    userName,
    onQuizComplete: handleQuizComplete,
  });

  const hasPassed = isCompleted && correctAnswers >= PASSING_SCORE;
  const isPerfectScore = isCompleted && correctAnswers === TOTAL_QUESTIONS;
  const alreadyCompleted = progress?.isCompleted ?? false;

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const hasStarted = messages.length > 0;
  const prevMessageCountRef = useRef(0);

  // Auto-scroll: smooth on new messages, instant during streaming.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (isNewMessage) {
      // New message added — always scroll smoothly.
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }

    // During streaming — keep scrolled to bottom if user hasn't scrolled up.
    if (isLoading) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 100) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  // Track quiz completion
  useEffect(() => {
    if (isCompleted) {
      trackEvent({
        area: TRACKING_AREAS.ACADEMY,
        object: "quiz",
        action: "complete",
        extra: {
          contentType,
          correctAnswers,
          isPerfect: isPerfectScore,
          hasPassed,
        },
      });
    }
  }, [isCompleted, contentType, correctAnswers, isPerfectScore, hasPassed]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) {
        return;
      }
      const answer = inputValue;
      setInputValue("");
      trackEvent({
        area: TRACKING_AREAS.ACADEMY,
        object: "quiz_answer",
        action: "submit",
        extra: { contentType, questionNumber: totalQuestions + 1 },
      });
      await submitAnswer(answer);
    },
    [inputValue, isLoading, submitAnswer, contentType, totalQuestions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const handleStart = useCallback(() => {
    trackEvent({
      area: TRACKING_AREAS.ACADEMY,
      object: "quiz",
      action: "start",
      extra: { contentType },
    });
    void startQuiz().then(() => {
      inputRef.current?.focus();
    });
  }, [startQuiz, contentType]);

  const handleReset = useCallback(
    (isRetry: boolean) => {
      trackEvent({
        area: TRACKING_AREAS.ACADEMY,
        object: "quiz",
        action: isRetry ? "retry" : "reset",
        extra: { contentType, correctAnswers, totalQuestions },
      });
      resetQuiz();
      setInputValue("");
    },
    [resetQuiz, contentType, correctAnswers, totalQuestions]
  );

  const greeting = userName
    ? `Ready to test your understanding, ${userName}?`
    : `Ready to test your understanding of this ${contentType}?`;

  return (
    <div className="mt-12 rounded-xl border border-highlight/20 bg-highlight/5">
      <div className="border-b border-highlight/20 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-highlight">
                Test Your Knowledge
              </h3>
              {alreadyCompleted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  <svg
                    className="h-3 w-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Completed
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Answer {TOTAL_QUESTIONS} questions — score {PASSING_SCORE} or more
              to pass
            </p>
          </div>
          {hasStarted && (
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-foreground">
                Question {Math.min(totalQuestions + 1, TOTAL_QUESTIONS)}/
                {TOTAL_QUESTIONS}
                {totalQuestions > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    ({correctAnswers} correct)
                  </span>
                )}
              </div>
              {!isCompleted && (
                <Button
                  variant="outline"
                  size="xs"
                  label="Reset"
                  onClick={() => handleReset(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Error display - shown in all states */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!hasStarted && !isLoading ? (
          <div className="text-center">
            <p className="mb-4 text-muted-foreground">{greeting}</p>
            {progress && (
              <p className="mb-4 text-sm text-muted-foreground">
                Best score: {progress.bestScore}/{TOTAL_QUESTIONS}
                {progress.attemptCount > 1 &&
                  ` (${progress.attemptCount} attempts)`}
              </p>
            )}
            <Button
              variant="primary"
              label={alreadyCompleted ? "Take Quiz Again" : "Start Quiz"}
              onClick={handleStart}
            />
          </div>
        ) : !hasStarted && isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Starting quiz...
          </div>
        ) : (
          <>
            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="mb-4 max-h-[500px] space-y-6 overflow-y-auto"
            >
              {messages.map((message, index) => {
                const isLastMessage = index === messages.length - 1;
                const isStreamingMessage =
                  isLoading && isLastMessage && message.role === "assistant";

                if (message.role === "assistant") {
                  return (
                    <ConversationMessageContainer
                      key={index}
                      messageType="agent"
                      type="agent"
                    >
                      <ConversationMessageAvatar
                        name={AGENT_NAME}
                        type="agent"
                      />
                      <div className="flex min-w-0 flex-col gap-1">
                        <ConversationMessageTitle
                          name={AGENT_NAME}
                          renderName={() => <span>{AGENT_NAME}</span>}
                        />
                        <ConversationMessageContent type="agent">
                          <Markdown
                            content={message.content}
                            isStreaming={isStreamingMessage}
                          />
                        </ConversationMessageContent>
                      </div>
                    </ConversationMessageContainer>
                  );
                }

                return (
                  <ConversationMessageContainer
                    key={index}
                    messageType="user"
                    type="user"
                    className="ml-auto max-w-3xl"
                  >
                    <ConversationMessageAvatar name="You" type="user" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <ConversationMessageTitle
                        name="You"
                        renderName={() => <span>You</span>}
                      />
                      <ConversationMessageContent type="user">
                        <div className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </div>
                      </ConversationMessageContent>
                    </div>
                  </ConversationMessageContainer>
                );
              })}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <ConversationMessageContainer messageType="agent" type="agent">
                  <ConversationMessageAvatar name={AGENT_NAME} type="agent" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <ConversationMessageTitle
                      name={AGENT_NAME}
                      renderName={() => <span>{AGENT_NAME}</span>}
                    />
                    <ConversationMessageContent type="agent">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner size="xs" />
                        Thinking...
                      </div>
                    </ConversationMessageContent>
                  </div>
                </ConversationMessageContainer>
              )}
            </div>

            {/* Input */}
            {!isCompleted && (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer..."
                  className="flex-1 resize-none rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-highlight focus:outline-none focus:ring-1 focus:ring-highlight"
                  rows={2}
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  variant="primary"
                  label="Submit"
                  disabled={isLoading || !inputValue.trim()}
                />
              </form>
            )}

            {/* Completion */}
            {isCompleted && (
              <div className="mt-6 rounded-lg border border-border bg-muted-background p-6">
                <div className="flex flex-col items-center text-center">
                  {hasPassed ? (
                    <>
                      <div className="mb-3 text-4xl">
                        {isPerfectScore ? "🎉" : "👏"}
                      </div>
                      <h4 className="mb-2 text-xl font-semibold text-highlight">
                        {alreadyCompleted
                          ? "Great Score Again!"
                          : "Chapter Completed!"}
                      </h4>
                      <div className="mb-2 text-3xl font-bold text-highlight">
                        {correctAnswers}/{TOTAL_QUESTIONS}
                      </div>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {isPerfectScore
                          ? "Excellent work! You've mastered this content."
                          : "Well done! You passed the quiz."}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 text-4xl">📚</div>
                      <h4 className="mb-2 text-xl font-semibold text-foreground">
                        Quiz Complete
                      </h4>
                      <div className="mb-2 text-3xl font-bold text-foreground">
                        {correctAnswers}/{TOTAL_QUESTIONS}
                      </div>
                      <p className="mb-4 text-sm text-muted-foreground">
                        You need at least {PASSING_SCORE}/{TOTAL_QUESTIONS} to
                        pass. Review the content and try again!
                      </p>
                    </>
                  )}
                  <Button
                    variant={hasPassed ? "outline" : "primary"}
                    label={hasPassed ? "Take Quiz Again" : "Try Again"}
                    onClick={() => handleReset(true)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
