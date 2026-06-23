/** @ignoreswagger */
import Anthropic from "@anthropic-ai/sdk";
import config from "@app/lib/api/config";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import { getClientIpFromContext } from "@front-api/lib/request";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import jwt from "jsonwebtoken";
import { z } from "zod";

const CSRF_TOKEN_EXPIRY = "30m";

const MAX_REQUESTS_PER_MINUTE = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 50000;
const TOTAL_QUESTIONS = 5;

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ChatRequestBodySchema = z.object({
  messages: z.array(ChatMessageSchema).max(MAX_MESSAGES),
  contentType: z.enum(["course", "lesson", "chapter"]),
  title: z.string(),
  content: z.string(),
  correctAnswers: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  userName: z.string().max(100).optional(),
});

function buildSystemPrompt(
  contentType: "course" | "lesson" | "chapter",
  title: string,
  content: string,
  correctAnswers: number,
  totalQuestions: number,
  userName?: string
): string {
  const truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);
  const studentContext = userName ? `The student's name is ${userName}.` : "";

  // Quiz is complete - give final assessment
  if (totalQuestions >= TOTAL_QUESTIONS) {
    const hasPassed = correctAnswers >= 3;
    const isPerfect = correctAnswers === TOTAL_QUESTIONS;
    let feedback: string;
    if (isPerfect) {
      feedback =
        "Congratulate them enthusiastically on their perfect score! Encourage them to explore other Academy content.";
    } else if (hasPassed) {
      feedback =
        "Congratulate them on passing! Briefly mention any areas they could review to improve further.";
    } else {
      feedback =
        "Give brief constructive feedback: acknowledge their effort, note they need 3/5 to pass, suggest reviewing areas they missed, and encourage them to try again.";
    }
    return `You are a quiz master for Dust Academy. ${studentContext} The user completed the quiz about the ${contentType} "${title}" with ${correctAnswers}/${TOTAL_QUESTIONS} correct. They need 3/${TOTAL_QUESTIONS} to pass.

${feedback}

Keep your response brief.`;
  }

  const questionsRemaining = TOTAL_QUESTIONS - totalQuestions;
  const isLastQuestion = questionsRemaining === 1;

  let progressInstruction: string;
  if (totalQuestions === 0) {
    progressInstruction =
      "Start by briefly introducing yourself and asking your first question.";
  } else if (isLastQuestion) {
    progressInstruction = `The student has answered ${totalQuestions}/${TOTAL_QUESTIONS} questions (${correctAnswers} correct). This is the LAST question. Evaluate their answer (start with ✅ or ❌), then give a brief summary of how they did. Do NOT ask another question after this.`;
  } else {
    progressInstruction = `The student has answered ${totalQuestions}/${TOTAL_QUESTIONS} questions (${correctAnswers} correct). Evaluate their answer, then ask question ${totalQuestions + 1} of ${TOTAL_QUESTIONS}.`;
  }

  return `You are a quiz master for Dust Academy testing the user's understanding of "${title}". ${studentContext}

RULES:
- Ask ONE question at a time testing comprehension (not memorization)
- Be LENIENT when grading: accept answers that demonstrate understanding even if they are incomplete, use different wording, or miss minor details. Only mark an answer wrong if it shows a fundamental misunderstanding or is entirely off-topic.
- After answering: start your evaluation with exactly "✅" if correct or "❌" if wrong (this is mandatory for every evaluation). Then briefly explain why, or give the right answer if wrong.
- Then ask the next question
- You MUST ask exactly ${TOTAL_QUESTIONS} questions total — no more, no less
- Cover different aspects of the content
- Do NOT mention question numbers or progress stats to the student
- Use markdown when helpful

${progressInstruction}

---
CONTENT:
${truncatedContent}
---`;
}

// The CSRF token is self-issued (GET) and self-verified (POST) within this
// service, so the HS256 secret never leaves front-api.
function generateCsrfToken(): string {
  return jwt.sign({ type: "academy_chat" }, config.getAcademyJwtSecret(), {
    algorithm: "HS256",
    expiresIn: CSRF_TOKEN_EXPIRY,
  });
}

function verifyCsrfToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, config.getAcademyJwtSecret(), {
      algorithms: ["HS256"],
    });
    return (
      typeof payload === "object" &&
      payload !== null &&
      "type" in payload &&
      payload.type === "academy_chat"
    );
  } catch {
    // `jsonwebtoken` throws on any verification failure (bad signature,
    // expiry, ...); treat all of these as an invalid token.
    return false;
  }
}

// Only requests originating from the marketing website are allowed. Mirrors the
// origin/referer check from the former Next.js handler.
function hasAllowedOrigin(ctx: Context): boolean {
  const allowedOrigin = config.getStaticWebsiteUrl();
  const origin = ctx.req.header("origin");
  const referer = ctx.req.header("referer");

  return (
    (origin !== undefined && origin.startsWith(allowedOrigin)) ||
    (referer !== undefined && referer.startsWith(allowedOrigin))
  );
}

// Mounted at /api/marketing/academy/chat. No session auth — the quiz is
// available to anonymous visitors; abuse is mitigated by origin + CSRF + IP
// rate limiting.
const app = unauthedApp();

// GET: issue a short-lived CSRF token for the subsequent POST.
app.get("/", async (ctx) => {
  if (!hasAllowedOrigin(ctx)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request origin not allowed.",
      },
    });
  }

  return ctx.json({ csrfToken: generateCsrfToken() });
});

// POST: stream the quiz-master response as SSE.
app.post("/", async (ctx) => {
  if (!hasAllowedOrigin(ctx)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request origin not allowed.",
      },
    });
  }

  const csrfToken = ctx.req.header("x-csrf-token");
  if (!csrfToken || !verifyCsrfToken(csrfToken)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid or missing CSRF token.",
      },
    });
  }

  const clientIp = getClientIpFromContext(ctx);
  const remaining = await rateLimiter({
    key: `academy_chat:${clientIp}`,
    maxPerTimeframe: MAX_REQUESTS_PER_MINUTE,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining <= 0) {
    return apiError(ctx, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "Too many requests. Please wait a moment and try again.",
      },
    });
  }

  const rawBody = await ctx.req.json().catch(() => null);
  const bodyValidation = ChatRequestBodySchema.safeParse(rawBody);
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
    messages,
    contentType,
    title,
    content,
    correctAnswers,
    totalQuestions,
    userName,
  } = bodyValidation.data;

  const anthropicApiKey = config.getDustManagedAnthropicApiKey();
  if (!anthropicApiKey) {
    logger.error("DUST_MANAGED_ANTHROPIC_API_KEY is not configured");
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Chat service is not configured.",
      },
    });
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const systemPrompt = buildSystemPrompt(
    contentType,
    title,
    content,
    correctAnswers,
    totalQuestions,
    userName
  );

  // Anthropic requires at least one message - add initial prompt if starting.
  const apiMessages: ChatMessage[] =
    messages.length === 0
      ? [{ role: "user", content: "Start the quiz." }]
      : messages;

  return streamEvents<{ text?: string; error?: string }>({
    ctx,
    iterator: async function* (signal) {
      try {
        const stream = await client.messages.create(
          {
            model: CLAUDE_SONNET_4_6_MODEL_ID,
            max_tokens: 1024,
            system: systemPrompt,
            messages: apiMessages,
            stream: true,
          },
          { signal }
        );

        for await (const event of stream) {
          if (signal.aborted) {
            break;
          }

          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            yield { text: event.delta.text };
          }
        }
      } catch (err) {
        // The client's SSE reader surfaces `{ error }` frames as a thrown
        // error; the stream then ends on EOF. The original `[DONE]` sentinel
        // is omitted because the client treats it as a no-op skip marker.
        logger.error({ err }, "Academy chat API error");
        yield { error: "An error occurred while generating the response." };
      }
    },
  });
});

export default app;
