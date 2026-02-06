"use client";

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

import { useAcademyQuiz } from "@app/hooks/useAcademyQuiz";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

interface AcademyQuizProps {
  contentType: "course" | "lesson";
  title: string;
  content: string;
}

const TOTAL_QUESTIONS = 5;
const AGENT_NAME = "DustMentor";

export function AcademyQuiz({ contentType, title, content }: AcademyQuizProps) {
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
  } = useAcademyQuiz({ contentType, title, content });

  const isPerfectScore = isCompleted && correctAnswers === TOTAL_QUESTIONS;

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const hasStarted = messages.length > 0;
  const prevMessageCountRef = useRef(0);

  // Scroll to bottom of messages container only when a new message is added
  useEffect(() => {
    if (
      messages.length > prevMessageCountRef.current &&
      messagesContainerRef.current
    ) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Track quiz completion
  useEffect(() => {
    if (isCompleted) {
      trackEvent({
        area: TRACKING_AREAS.ACADEMY,
        object: "quiz",
        action: "complete",
        extra: { contentType, correctAnswers, isPerfect: isPerfectScore },
      });
    }
  }, [isCompleted, contentType, correctAnswers, isPerfectScore]);

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

  return (
    <div className="mt-12 rounded-xl border border-highlight/20 bg-highlight/5">
      <div className="border-b border-highlight/20 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-highlight">
              Test Your Knowledge
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Answer {TOTAL_QUESTIONS} questions to complete the quiz
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
            <p className="mb-4 text-muted-foreground">
              Ready to test your understanding of this {contentType}?
            </p>
            <Button
              variant="primary"
              label="Start Quiz"
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
                  {isPerfectScore ? (
                    <>
                      <div className="mb-3 text-4xl">🎉</div>
                      <h4 className="mb-2 text-xl font-semibold text-highlight">
                        Perfect Score!
                      </h4>
                      <div className="mb-2 text-3xl font-bold text-highlight">
                        {correctAnswers}/{TOTAL_QUESTIONS}
                      </div>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Excellent work! You've mastered this content.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 text-4xl">
                        {correctAnswers >= 3 ? "👍" : "📚"}
                      </div>
                      <h4 className="mb-2 text-xl font-semibold text-foreground">
                        Quiz Complete
                      </h4>
                      <div className="mb-2 text-3xl font-bold text-foreground">
                        {correctAnswers}/{TOTAL_QUESTIONS}
                      </div>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {correctAnswers >= 4
                          ? "Great job! You're almost there."
                          : correctAnswers >= 3
                            ? "Good effort! Review the content and try again."
                            : "Keep learning! Review the content above and give it another shot."}
                      </p>
                    </>
                  )}
                  <Button
                    variant={isPerfectScore ? "outline" : "primary"}
                    label={isPerfectScore ? "Take Quiz Again" : "Try Again"}
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
