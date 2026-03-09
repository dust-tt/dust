import { getAcademyIdentifier } from "@app/lib/api/academy_api";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AcademyChapterVisitResource } from "@app/lib/resources/academy_chapter_visit_resource";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiResponse } from "next";
import { z } from "zod";

const PostVisitBodySchema = z.object({
  courseSlug: z.string().min(1),
  chapterSlug: z.string().min(1),
});

interface PostVisitResponse {
  success: boolean;
}

async function handler(
  req: NextApiRequestWithContext,
  res: NextApiResponse<WithAPIErrorResponse<PostVisitResponse>>,
  { session }: { session: SessionWithUser | null }
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

  await AcademyChapterVisitResource.recordVisit(
    identifier,
    courseSlug,
    chapterSlug
  );

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
