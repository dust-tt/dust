// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { getAcademyIdentifier } from "@app/lib/api/academy_api";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AcademyQuizAttemptResource } from "@app/lib/resources/academy_quiz_attempt_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiResponse } from "next";

export interface CourseProgressData {
  completedChapterSlugs: string[];
  attemptedChapterSlugs: string[];
  lastAttemptAt: string;
}

interface GetCourseProgressResponse {
  courseProgress: Record<string, CourseProgressData>;
}

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<GetCourseProgressResponse>>,
  { session }: { session: SessionWithUser | null }
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const identifier = await getAcademyIdentifier(req.headers, session);
  if (!identifier) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Authentication or browser ID required.",
      },
    });
  }

  const courseProgressMap =
    await AcademyQuizAttemptResource.getAllCourseProgress(identifier);

  const courseProgress: Record<string, CourseProgressData> = {};
  for (const [courseSlug, data] of courseProgressMap) {
    courseProgress[courseSlug] = {
      completedChapterSlugs: data.completedChapterSlugs,
      attemptedChapterSlugs: data.attemptedChapterSlugs,
      lastAttemptAt: data.lastAttemptAt.toISOString(),
    };
  }

  // Prevent HTTP caching — progress changes on every chapter visit.
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({ courseProgress });
}

export default withLogging(handler);
