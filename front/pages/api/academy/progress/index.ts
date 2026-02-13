import type { NextApiResponse } from "next";
import { z } from "zod";

import { getAcademyIdentifier } from "@app/lib/api/academy_api";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AcademyQuizAttemptResource } from "@app/lib/resources/academy_quiz_attempt_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

const PostProgressBodySchema = z.object({
  contentType: z.enum(["course", "lesson", "chapter"]),
  contentSlug: z.string().min(1),
  courseSlug: z.string().min(1).optional(),
  correctAnswers: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
});

interface ContentProgress {
  attemptCount: number;
  bestScore: number;
  isCompleted: boolean;
  lastAttemptAt: string;
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

interface GetProgressResponse {
  progress: ContentProgress | null;
}

type ProgressResponseBody = GetProgressResponse | PostProgressResponse;

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<ProgressResponseBody>>,
  { session }: { session: SessionWithUser | null }
): Promise<void> {
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

  if (req.method === "GET") {
    const { contentType, contentSlug } = req.query;

    if (!isString(contentType) || !isString(contentSlug)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Missing required query parameters: contentType and contentSlug.",
        },
      });
    }

    if (!["course", "lesson", "chapter"].includes(contentType)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid contentType. Must be course, lesson, or chapter.",
        },
      });
    }

    const progress = await AcademyQuizAttemptResource.getProgressForContent(
      identifier,
      contentType as "course" | "lesson" | "chapter",
      contentSlug
    );

    return res.status(200).json({
      progress: progress
        ? {
            attemptCount: progress.attemptCount,
            bestScore: progress.bestScore,
            isCompleted: progress.isCompleted,
            lastAttemptAt: progress.lastAttemptAt.toISOString(),
          }
        : null,
    });
  }

  if (req.method === "POST") {
    const bodyValidation = PostProgressBodySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request body: ${bodyValidation.error.message}`,
        },
      });
    }

    const {
      contentType,
      contentSlug,
      courseSlug,
      correctAnswers,
      totalQuestions,
    } = bodyValidation.data;

    // Check if user already had a perfect score before this attempt.
    const hadPerfectScore = await AcademyQuizAttemptResource.hasPerfectScore(
      identifier,
      contentType,
      contentSlug
    );

    const attempt = await AcademyQuizAttemptResource.recordAttempt(identifier, {
      contentType,
      contentSlug,
      courseSlug,
      correctAnswers,
      totalQuestions,
    });

    const isNewCompletion = attempt.isPerfect && !hadPerfectScore;

    return res.status(201).json({
      attempt: {
        id: attempt.id,
        contentType: attempt.contentType,
        contentSlug: attempt.contentSlug,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        isPerfect: attempt.isPerfect,
        createdAt: attempt.createdAt.toISOString(),
      },
      isNewCompletion,
    });
  }

  return apiError(req, res, {
    status_code: 405,
    api_error: {
      type: "method_not_supported_error",
      message: "Only GET and POST methods are supported.",
    },
  });
}

export default withLogging(handler);
