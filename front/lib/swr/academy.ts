import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

interface ContentProgress {
  attemptCount: number;
  bestScore: number;
  isCompleted: boolean;
  lastAttemptAt: string;
}

interface GetProgressResponse {
  progress: ContentProgress | null;
}

interface CourseProgressData {
  completedChapterSlugs: string[];
  attemptedChapterSlugs: string[];
  lastAttemptAt: string;
}

interface GetCourseProgressResponse {
  courseProgress: Record<string, CourseProgressData>;
}

interface PostProgressResponse {
  attempt: {
    id: number;
    contentType: string;
    contentSlug: string;
    correctAnswers: number;
    totalQuestions: number;
    isPerfect: boolean;
    createdAt: string;
  };
  isNewCompletion: boolean;
}

export function useAcademyContentProgress({
  contentType,
  contentSlug,
  disabled,
}: {
  contentType: "course" | "lesson" | "chapter";
  contentSlug: string;
  disabled?: boolean;
}) {
  const progressFetcher: Fetcher<GetProgressResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/academy/progress?contentType=${contentType}&contentSlug=${contentSlug}`,
    progressFetcher,
    { disabled }
  );

  return {
    progress: data?.progress ?? null,
    isProgressLoading: !error && !data && !disabled,
    isProgressError: error,
    mutateProgress: mutate,
  };
}

export function useAcademyCourseProgress({
  disabled,
}: {
  disabled?: boolean;
} = {}) {
  const courseProgressFetcher: Fetcher<GetCourseProgressResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/academy/progress/courses`,
    courseProgressFetcher,
    { disabled }
  );

  return {
    courseProgress: data?.courseProgress ?? null,
    isCourseProgressLoading: !error && !data && !disabled,
    isCourseProgressError: error,
    mutateCourseProgress: mutate,
  };
}

export function useRecordQuizAttempt() {
  const sendNotification = useSendNotification();

  const { mutateProgress } = useAcademyContentProgress({
    contentType: "course",
    contentSlug: "",
    disabled: true,
  });
  const { mutateCourseProgress } = useAcademyCourseProgress({ disabled: true });

  const recordAttempt = useCallback(
    async ({
      contentType,
      contentSlug,
      courseSlug,
      correctAnswers,
      totalQuestions,
    }: {
      contentType: "course" | "lesson" | "chapter";
      contentSlug: string;
      courseSlug?: string;
      correctAnswers: number;
      totalQuestions: number;
    }): Promise<PostProgressResponse | null> => {
      try {
        const response = await clientFetch("/api/academy/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType,
            contentSlug,
            courseSlug,
            correctAnswers,
            totalQuestions,
          }),
        });

        if (!response.ok) {
          return null;
        }

        const result: PostProgressResponse = await response.json();

        // Mutate related SWR caches.
        void mutateProgress();
        void mutateCourseProgress();

        if (result.isNewCompletion) {
          sendNotification({
            title: "Chapter completed!",
            description: "Congratulations! Your progress has been saved.",
            type: "success",
          });
        }

        return result;
      } catch {
        return null;
      }
    },
    [mutateProgress, mutateCourseProgress, sendNotification]
  );

  return { recordAttempt };
}
