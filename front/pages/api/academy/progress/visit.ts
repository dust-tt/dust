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
import type { UserTypeWithWorkspaces } from "@app/types/user";

const PostVisitBodySchema = z.object({
  courseSlug: z.string().min(1),
  chapterSlug: z.string().min(1),
});

interface PostVisitResponse {
  success: boolean;
}

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
  res: NextApiResponse<WithAPIErrorResponse<PostVisitResponse>>,
  session: SessionWithUser
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

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

  const bodyValidation = PostVisitBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error.message}`,
      },
    });
  }

  const { courseSlug, chapterSlug } = bodyValidation.data;

  await AcademyQuizAttemptResource.recordChapterVisit(
    userResource,
    courseSlug,
    chapterSlug
  );

  return res.status(200).json({ success: true });
}

export default withSessionAuthentication(handler);
