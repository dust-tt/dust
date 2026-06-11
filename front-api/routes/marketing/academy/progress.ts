/** @ignoreswagger */
import type { CourseProgressData } from "@app/lib/api/academy_api";
import { getAcademyIdentifier } from "@app/lib/api/academy_api";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { AcademyChapterVisitResource } from "@app/lib/resources/academy_chapter_visit_resource";
import { AcademyQuizAttemptResource } from "@app/lib/resources/academy_quiz_attempt_resource";
import { unauthedApp } from "@front-api/middlewares/ctx";
import {
  resolveOptionalSession,
  resolveSession,
} from "@front-api/middlewares/session_resolution";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GetProgressQuerySchema = z.object({
  contentType: z.enum(["course", "lesson", "chapter"]),
  contentSlug: z.string().min(1),
});

const PostProgressBodySchema = z.object({
  contentType: z.enum(["course", "lesson", "chapter"]),
  contentSlug: z.string().min(1),
  courseSlug: z.string().min(1).optional(),
  correctAnswers: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
});

const PostVisitBodySchema = z.object({
  courseSlug: z.string().min(1),
  chapterSlug: z.string().min(1),
});

const BackfillBodySchema = z.object({
  browserId: z.string().regex(UUID_RE),
});

// `getAcademyIdentifier` only reads `x-academy-browser-id`; forward just that
// header in the shape it expects.
function browserIdHeaders(ctx: Context): Record<string, string | undefined> {
  return { "x-academy-browser-id": ctx.req.header("x-academy-browser-id") };
}

// Mounted at /api/marketing/academy/progress. Most routes accept an optional
// session and fall back to an anonymous `X-Academy-Browser-Id`; `/backfill`
// requires a logged-in user.
const app = unauthedApp();

// GET /: progress for a single piece of content.
app.get("/", async (ctx) => {
  const session = await resolveOptionalSession(ctx);
  const identifier = await getAcademyIdentifier(browserIdHeaders(ctx), session);
  if (!identifier) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Authentication or browser ID required.",
      },
    });
  }

  const queryValidation = GetProgressQuerySchema.safeParse({
    contentType: ctx.req.query("contentType"),
    contentSlug: ctx.req.query("contentSlug"),
  });
  if (!queryValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Missing or invalid query parameters: contentType and contentSlug.",
      },
    });
  }

  const { contentType, contentSlug } = queryValidation.data;

  const progress = await AcademyQuizAttemptResource.getProgressForContent(
    identifier,
    contentType,
    contentSlug
  );

  return ctx.json({
    progress: progress
      ? {
          attemptCount: progress.attemptCount,
          bestScore: progress.bestScore,
          isCompleted: progress.isCompleted,
          lastAttemptAt: progress.lastAttemptAt.toISOString(),
        }
      : null,
  });
});

// POST /: record a quiz attempt.
app.post("/", async (ctx) => {
  const session = await resolveOptionalSession(ctx);
  const identifier = await getAcademyIdentifier(browserIdHeaders(ctx), session);
  if (!identifier) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Authentication or browser ID required.",
      },
    });
  }

  const rawBody = await ctx.req.json().catch(() => null);
  const bodyValidation = PostProgressBodySchema.safeParse(rawBody);
  if (!bodyValidation.success) {
    return apiError(ctx, {
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

  // Check if user already had a passing score before this attempt.
  const hadPassingScore = await AcademyQuizAttemptResource.hasPassingScore(
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

  const isNewCompletion = attempt.isPassed && !hadPassingScore;

  return ctx.json(
    {
      attempt: {
        sId: attempt.sId,
        contentType: attempt.contentType,
        contentSlug: attempt.contentSlug,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        isPassed: attempt.isPassed,
        createdAt: attempt.createdAt.toISOString(),
      },
      isNewCompletion,
    },
    201
  );
});

// GET /courses: progress across all courses.
app.get("/courses", async (ctx) => {
  const session = await resolveOptionalSession(ctx);
  const identifier = await getAcademyIdentifier(browserIdHeaders(ctx), session);
  if (!identifier) {
    return apiError(ctx, {
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
  ctx.header("Cache-Control", "no-store");

  return ctx.json({ courseProgress });
});

// POST /backfill: attach an anonymous browser id's progress to the logged-in
// user. Requires a session.
app.post("/backfill", async (ctx) => {
  const sessionResult = await resolveSession(ctx);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const user = await fetchUserFromSession(sessionResult);
  if (!user) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "User not found.",
      },
    });
  }

  const rawBody = await ctx.req.json().catch(() => null);
  const bodyValidation = BackfillBodySchema.safeParse(rawBody);
  if (!bodyValidation.success) {
    return apiError(ctx, {
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

  return ctx.json({ backfilledVisits, backfilledAttempts });
});

// POST /visit: record that a chapter was visited.
app.post("/visit", async (ctx) => {
  const session = await resolveOptionalSession(ctx);
  const identifier = await getAcademyIdentifier(browserIdHeaders(ctx), session);
  if (!identifier) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "invalid_request_error",
        message: "Authentication or browser ID required.",
      },
    });
  }

  const rawBody = await ctx.req.json().catch(() => null);
  const bodyValidation = PostVisitBodySchema.safeParse(rawBody);
  if (!bodyValidation.success) {
    return apiError(ctx, {
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

  return ctx.json({ success: true });
});

export default app;
