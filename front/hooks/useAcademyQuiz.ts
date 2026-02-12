import { clientFetch } from "@app/lib/egress/client";
import { useCallback, useRef, useState } from "react";

interface QuizMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseAcademyQuizParams {
  contentType: "course" | "lesson" | "chapter";
  title: string;
  content: string;
  userName?: string;
  onQuizComplete?: (correctAnswers: number, totalQuestions: number) => void;
}

interface UseAcademyQuizReturn {
  messages: QuizMessage[];
  isLoading: boolean;
  error: string | null;
  correctAnswers: number;
  totalQuestions: number;
  isCompleted: boolean;
  startQuiz: () => Promise<void>;
  submitAnswer: (answer: string) => Promise<void>;
  resetQuiz: () => void;
}

const TOTAL_QUESTIONS = 5;

const CORRECT_INDICATORS = [
  "correct",
  "right",
  "exactly",
  "well done",
  "great job",
  "that's it",
  "you got it",
  "perfect",
  "excellent",
  "good answer",
  "spot on",
  "precisely",
];

const INCORRECT_INDICATORS = [
  "not quite",
  "incorrect",
  "not correct",
  "wrong",
  "actually",
  "the correct answer",
  "let me explain",
  "that's not",
];

export function useAcademyQuiz({
  contentType,
  title,
  content,
  userName,
  onQuizComplete,
}: UseAcademyQuizParams): UseAcademyQuizReturn {
  const [messages, setMessages] = useState<QuizMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const csrfTokenRef = useRef<string | null>(null);

  const isCompleted = totalQuestions >= TOTAL_QUESTIONS;

  const fetchCsrfToken = useCallback(async (): Promise<string> => {
    // Return cached token if available
    if (csrfTokenRef.current) {
      return csrfTokenRef.current;
    }

    const response = await clientFetch("/api/academy/chat", {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to get CSRF token");
    }

    const data = await response.json();
    csrfTokenRef.current = data.csrfToken;
    return data.csrfToken;
  }, []);

  const streamResponse = useCallback(
    async (
      messagesToSend: QuizMessage[],
      currentCorrectAnswers: number,
      currentTotalQuestions: number
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch CSRF token before making the request
        const csrfToken = await fetchCsrfToken();

        const response = await clientFetch("/api/academy/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            messages: messagesToSend,
            contentType,
            title,
            content,
            correctAnswers: currentCorrectAnswers,
            totalQuestions: currentTotalQuestions,
            userName,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Failed to get response";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message ?? errorMessage;
          } catch {
            errorMessage = `Request failed with status ${response.status}`;
          }
          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let assistantMessage = "";

        // Add placeholder for assistant message
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  assistantMessage += parsed.text;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = {
                      role: "assistant",
                      content: assistantMessage,
                    };
                    return newMessages;
                  });
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }

        // Count if user just answered (not the initial "start quiz" request)
        const userJustAnswered =
          messagesToSend.length > 0 &&
          messagesToSend[messagesToSend.length - 1].role === "user";

        if (userJustAnswered) {
          const newTotalQuestions = currentTotalQuestions + 1;
          setTotalQuestions(newTotalQuestions);

          // Check if response indicates correct answer
          const lowerResponse = assistantMessage.toLowerCase();
          const isCorrect =
            CORRECT_INDICATORS.some((i) => lowerResponse.includes(i)) &&
            !INCORRECT_INDICATORS.some((i) => lowerResponse.includes(i));

          const newCorrectAnswers = isCorrect
            ? currentCorrectAnswers + 1
            : currentCorrectAnswers;

          if (isCorrect) {
            setCorrectAnswers(newCorrectAnswers);
          }

          // Invoke callback when quiz is complete.
          if (newTotalQuestions >= TOTAL_QUESTIONS && onQuizComplete) {
            onQuizComplete(newCorrectAnswers, newTotalQuestions);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        // Remove the placeholder message on error
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    },
    [contentType, title, content, userName, fetchCsrfToken, onQuizComplete]
  );

  const startQuiz = useCallback(async () => {
    setMessages([]);
    setCorrectAnswers(0);
    setTotalQuestions(0);
    setError(null);
    await streamResponse([], 0, 0);
  }, [streamResponse]);

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (isLoading || !answer.trim() || isCompleted) {
        return;
      }

      const userMessage: QuizMessage = { role: "user", content: answer.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      await streamResponse(newMessages, correctAnswers, totalQuestions);
    },
    [
      messages,
      isLoading,
      correctAnswers,
      totalQuestions,
      isCompleted,
      streamResponse,
    ]
  );

  const resetQuiz = useCallback(() => {
    setMessages([]);
    setCorrectAnswers(0);
    setTotalQuestions(0);
    setError(null);
    setIsLoading(false);
    csrfTokenRef.current = null; // Clear token so a fresh one is fetched on next quiz
  }, []);

  return {
    messages,
    isLoading,
    error,
    correctAnswers,
    totalQuestions,
    isCompleted,
    startQuiz,
    submitAnswer,
    resetQuiz,
  };
}
