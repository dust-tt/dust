import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { AcademyChapterVisitResource } from "@app/lib/resources/academy_chapter_visit_resource";
import { AcademyQuizAttemptResource } from "@app/lib/resources/academy_quiz_attempt_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiResponse } from "next";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BackfillBodySchema = z.object({
  browserId: z.string().regex(UUID_RE),
});

interface BackfillResponse {
  backfilledVisits: number;
  backfilledAttempts: number;
}

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<BackfillResponse>>,
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

  const user = await fetchUserFromSession(session);
  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "User not found.",
      },
    });
  }

  const bodyValidation = BackfillBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error.message}`,
      },
    });
  }

  const { browserId } = bodyValidation.data;

  const [backfilledVisits, backfilledAttempts] = await Promise.all([
    AcademyChapterVisitResource.backfillBrowserId(browserId, user.id),
    AcademyQuizAttemptResource.backfillBrowserId(browserId, user.id),
  ]);

  return res.status(200).json({ backfilledVisits, backfilledAttempts });
}

export default withSessionAuthentication(handler);
