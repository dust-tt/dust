import Anthropic from "@anthropic-ai/sdk";
import jwt from "jsonwebtoken";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import config from "@app/lib/api/config";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { isString } from "@app/types/shared/utils/general";

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

const ChatRequestBodySchema = z.object({
  messages: z.array(ChatMessageSchema).max(MAX_MESSAGES),
  contentType: z.enum(["course", "lesson", "chapter"]),
  title: z.string(),
  content: z.string(),
  correctAnswers: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
});

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (isString(forwarded)) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function buildSystemPrompt(
  contentType: "course" | "lesson" | "chapter",
  title: string,
  content: string,
  correctAnswers: number,
  totalQuestions: number
): string {
  const truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);

  // Quiz is complete - give final assessment
  if (totalQuestions >= TOTAL_QUESTIONS) {
    const isPerfect = correctAnswers === TOTAL_QUESTIONS;
    return `You are a quiz master for Dust Academy. The user completed the quiz about the ${contentType} "${title}" with ${correctAnswers}/${TOTAL_QUESTIONS} correct.

${isPerfect ? "Congratulate them enthusiastically on their perfect score! Encourage them to explore other Academy content." : "Give brief constructive feedback: acknowledge their effort, suggest reviewing areas they missed, and encourage them to try again."}

Keep your response brief.`;
  }

  return `You are a quiz master for Dust Academy testing the user's understanding of "${title}".

RULES:
- Ask ONE question at a time testing comprehension (not memorization)
- After answering: acknowledge if correct, or briefly explain the right answer if wrong
- Then ask the next question
- Cover different aspects of the content
- Do NOT mention question numbers or progress stats
- Use markdown when helpful

${totalQuestions > 0 ? `Progress: ${totalQuestions}/${TOTAL_QUESTIONS} answered, ${correctAnswers} correct.` : "Start by briefly introducing yourself and asking your first question."}

---
CONTENT:
${truncatedContent}
---`;
}

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
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Validate origin to ensure request comes from our website
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedOrigin = config.getClientFacingUrl();

  const isValidOrigin =
    (origin !== undefined && origin.startsWith(allowedOrigin)) ||
    (referer !== undefined && referer.startsWith(allowedOrigin));

  if (!isValidOrigin) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request origin not allowed.",
      },
    });
  }

  // GET: Return a CSRF token
  if (req.method === "GET") {
    return res.status(200).json({ csrfToken: generateCsrfToken() });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET and POST methods are supported.",
      },
    });
  }

  // Verify CSRF token
  const csrfToken = req.headers["x-csrf-token"];
  if (!isString(csrfToken) || !verifyCsrfToken(csrfToken)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid or missing CSRF token.",
      },
    });
  }

  // Rate limiting by IP
  const clientIp = getClientIp(req);
  const remaining = await rateLimiter({
    key: `academy_chat:${clientIp}`,
    maxPerTimeframe: MAX_REQUESTS_PER_MINUTE,
    timeframeSeconds: 60,
    logger,
  });

  if (remaining === 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "Too many requests. Please wait a moment and try again.",
      },
    });
  }

  // Validate request body using Zod schema
  const bodyValidation = ChatRequestBodySchema.safeParse(req.body);
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
    messages,
    contentType,
    title,
    content,
    correctAnswers,
    totalQuestions,
  } = bodyValidation.data;

  const { ANTHROPIC_API_KEY } = dustManagedCredentials();
  if (!ANTHROPIC_API_KEY) {
    logger.error("DUST_MANAGED_ANTHROPIC_API_KEY is not configured");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Chat service is not configured.",
      },
    });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = buildSystemPrompt(
      contentType,
      title,
      content,
      correctAnswers,
      totalQuestions
    );

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Create abort controller for client disconnect
    const controller = new AbortController();
    req.on("close", () => {
      controller.abort();
    });

    // Anthropic requires at least one message - add initial prompt if starting quiz
    const apiMessages =
      messages.length === 0
        ? [{ role: "user" as const, content: "Start the quiz." }]
        : messages;

    const stream = await client.messages.create({
      model: "claude-4-sonnet-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
      stream: true,
    });

    for await (const event of stream) {
      if (controller.signal.aborted) {
        break;
      }

      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        // @ts-expect-error - flush is needed for streaming but not in types
        res.flush();
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    logger.error({ error }, "Academy chat API error");

    // If headers already sent, just end the response
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: "An error occurred while generating the response." })}\n\n`
      );
      res.end();
      return;
    }

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to generate response.",
      },
    });
  }
}
