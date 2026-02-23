import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { CourseProgressData } from "@app/pages/api/academy/progress/courses";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

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
    isPassed: boolean;
    createdAt: string;
  };
  isNewCompletion: boolean;
}

function makeBrowserIdFetcher<T>(
  browserId: string | null,
  fetcher: Fetcher<T, string>
): Fetcher<T, string> {
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
  const { fetcher } = useFetcher();
  const progressFetcher: Fetcher<GetProgressResponse, string> =
    makeBrowserIdFetcher(browserId ?? null, fetcher);

  // `_bid` is a cache-busting parameter so SWR refetches when the browserId
  // becomes available (it starts as null during SSR). The server ignores it;
  // the actual browserId is sent via the X-Academy-Browser-Id header.
  const url = browserId
    ? `/api/academy/progress?contentType=${contentType}&contentSlug=${contentSlug}&_bid=${browserId}`
    : `/api/academy/progress?contentType=${contentType}&contentSlug=${contentSlug}`;

  const { data, error, mutate } = useSWRWithDefaults(url, progressFetcher, {
    disabled,
  });

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
  const { fetcher } = useFetcher();
  const courseProgressFetcher: Fetcher<GetCourseProgressResponse, string> =
    makeBrowserIdFetcher(browserId ?? null, fetcher);

  // `_bid` is a cache-busting parameter so SWR refetches when the browserId
  // becomes available (it starts as null during SSR). The server ignores it;
  // the actual browserId is sent via the X-Academy-Browser-Id header.
  const url = browserId
    ? `/api/academy/progress/courses?_bid=${browserId}`
    : `/api/academy/progress/courses`;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    courseProgressFetcher,
    {
      disabled,
    }
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
  const { mutate: globalMutate } = useSWRConfig();

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

        // Invalidate all progress and course progress caches.
        void globalMutate(
          (key) =>
            typeof key === "string" && key.startsWith("/api/academy/progress")
        );

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
    [browserId, globalMutate, sendNotification]
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
