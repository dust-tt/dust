import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

const BROWSER_ID_KEY = "dust_academy_browser_id";

function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Returns a stable browserId from localStorage (generated on first call).
 * Safe to call during SSR — returns null on the server.
 */
export function useAcademyBrowserId(): string | null {
  const [browserId, setBrowserId] = useState<string | null>(null);

  useEffect(() => {
    let id = localStorage.getItem(BROWSER_ID_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(BROWSER_ID_KEY, id);
    }
    setBrowserId(id);
  }, []);

  return browserId;
}

/**
 * Clear the browserId from localStorage (called after successful backfill).
 */
function clearBrowserId() {
  localStorage.removeItem(BROWSER_ID_KEY);
}

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

function makeBrowserIdFetcher<T>(browserId: string | null): Fetcher<T, string> {
  if (!browserId) {
    return fetcher;
  }
  return async (url: string) => {
    const res = await clientFetch(url, {
      headers: { "X-Academy-Browser-Id": browserId },
    });
    if (!res.ok) {
      const error = new Error("An error occurred while fetching the data.");
      throw error;
    }
    return res.json();
  };
}

export function useAcademyContentProgress({
  contentType,
  contentSlug,
  disabled,
  browserId,
}: {
  contentType: "course" | "lesson" | "chapter";
  contentSlug: string;
  disabled?: boolean;
  browserId?: string | null;
}) {
  const progressFetcher: Fetcher<GetProgressResponse, string> =
    makeBrowserIdFetcher(browserId ?? null);

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
  browserId,
}: {
  disabled?: boolean;
  browserId?: string | null;
} = {}) {
  const courseProgressFetcher: Fetcher<GetCourseProgressResponse, string> =
    makeBrowserIdFetcher(browserId ?? null);

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

export function useRecordQuizAttempt({
  browserId,
}: {
  browserId?: string | null;
} = {}) {
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
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (browserId) {
          headers["X-Academy-Browser-Id"] = browserId;
        }

        const response = await clientFetch("/api/academy/progress", {
          method: "POST",
          headers,
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
    [browserId, mutateProgress, mutateCourseProgress, sendNotification]
  );

  return { recordAttempt };
}

/**
 * When a user logs in and has a browserId, backfill their anonymous progress
 * to their account, then clear the browserId.
 */
export function useAcademyBackfill({
  academyUser,
  browserId,
  mutateCourseProgress,
}: {
  academyUser: { firstName: string; sId: string } | null;
  browserId: string | null;
  mutateCourseProgress: () => void;
}) {
  const didBackfill = useRef(false);

  useEffect(() => {
    if (!academyUser || !browserId || didBackfill.current) {
      return;
    }
    didBackfill.current = true;

    void (async () => {
      try {
        const res = await clientFetch("/api/academy/progress/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserId }),
        });
        if (res.ok) {
          clearBrowserId();
          mutateCourseProgress();
        }
      } catch {
        // Silently fail — user can still track progress going forward.
      }
    })();
  }, [academyUser, browserId, mutateCourseProgress]);
}
