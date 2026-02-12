import type { NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { AcademyQuizAttemptResource } from "@app/lib/resources/academy_quiz_attempt_resource";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { UserTypeWithWorkspaces } from "@app/types/user";

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

async function checkAcademyAccess(
  userWithWorkspaces: UserTypeWithWorkspaces
): Promise<boolean> {
  for (const workspace of userWithWorkspaces.workspaces) {
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (workspaceResource) {
      const hasFlag = await FeatureFlagResource.isEnabledForWorkspace(
        workspaceResource,
        "dust_academy"
      );
      if (hasFlag) {
        return true;
      }
    }
  }

  return false;
}

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<ProgressResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const userWithWorkspaces = await getUserFromSession(session);
  if (!userWithWorkspaces) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "User not found.",
      },
    });
  }

  const hasAccess = await checkAcademyAccess(userWithWorkspaces);
  if (!hasAccess) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Academy access required.",
      },
    });
  }

  const userResource = await fetchUserFromSession(session);
  if (!userResource) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "User not found.",
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
      userResource,
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
      userResource,
      contentType,
      contentSlug
    );

    const attempt = await AcademyQuizAttemptResource.recordAttempt(
      userResource,
      {
        contentType,
        contentSlug,
        courseSlug,
        correctAnswers,
        totalQuestions,
      }
    );

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

export default withSessionAuthentication(handler);
