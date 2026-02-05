import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { dustManagedCredentials, isString } from "@app/types";

const MAX_REQUESTS_PER_MINUTE = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 50000;
const TOTAL_QUESTIONS = 5;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  contentType: "course" | "lesson";
  title: string;
  content: string;
  correctAnswers: number;
  totalQuestions: number;
}

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (isString(forwarded)) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function buildSystemPrompt(
  contentType: "course" | "lesson",
  title: string,
  content: string,
  correctAnswers: number,
  totalQuestions: number
): string {
  const truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);
  const questionsRemaining = TOTAL_QUESTIONS - totalQuestions;

  // Quiz is complete - give final assessment
  if (totalQuestions >= TOTAL_QUESTIONS) {
    const score = correctAnswers;
    const isPerfect = score === TOTAL_QUESTIONS;

    if (isPerfect) {
      return `You are a quiz master for Dust Academy. The user has just completed the quiz about the ${contentType} "${title}" with a PERFECT score: ${score}/${TOTAL_QUESTIONS} correct!

Congratulate them enthusiastically! Tell them they have demonstrated an excellent understanding of the material. Encourage them to continue learning with other courses and lessons in the Academy.

Keep your response brief and celebratory.`;
    }

    return `You are a quiz master for Dust Academy. The user has just completed the quiz about the ${contentType} "${title}" with a score of ${score}/${TOTAL_QUESTIONS} correct.

Give them constructive feedback:
- Acknowledge their effort
- Briefly mention what areas they might want to review based on the questions they got wrong
- Encourage them to try again or explore other courses

Keep your response encouraging but honest about their performance.`;
  }

  const progressInfo =
    totalQuestions > 0
      ? `\n6. Progress: ${totalQuestions}/${TOTAL_QUESTIONS} questions answered, ${correctAnswers} correct so far
7. Questions remaining: ${questionsRemaining}`
      : "";

  return `You are a quiz master for Dust Academy. Your role is to test the user's understanding of this ${contentType} titled "${title}".

QUIZ RULES:
1. Ask ONE question at a time about the content below
2. Questions should test comprehension, not memorization of exact phrases
3. After the user answers, evaluate if they understood the concept correctly
4. If correct: acknowledge it positively
5. If incorrect: provide a brief explanation of the correct answer${progressInfo}
8. Make questions cover different aspects of the content
9. Be encouraging but accurate in your evaluation
10. Do NOT mention progress stats or question numbers in your responses

FORMAT:
- Keep questions concise and clear
- After evaluating an answer, always ask the next question
- Use markdown formatting when helpful

---
CONTENT TO QUIZ ON:
${truncatedContent}
---

${totalQuestions === 0 ? "Start by introducing yourself briefly and asking your first question about the content. Do not mention any progress or stats." : "Continue the quiz based on the conversation."}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
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

  // Validate request body
  const {
    messages,
    contentType,
    title,
    content,
    correctAnswers,
    totalQuestions,
  } = req.body as ChatRequestBody;

  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Messages must be an array with at most ${MAX_MESSAGES} items.`,
      },
    });
  }

  if (contentType !== "course" && contentType !== "lesson") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "contentType must be 'course' or 'lesson'.",
      },
    });
  }

  if (!isString(title) || !isString(content)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "title and content are required strings.",
      },
    });
  }

  if (typeof correctAnswers !== "number" || correctAnswers < 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "correctAnswers must be a non-negative number.",
      },
    });
  }

  if (typeof totalQuestions !== "number" || totalQuestions < 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "totalQuestions must be a non-negative number.",
      },
    });
  }

  // Validate individual messages
  for (const msg of messages) {
    if (
      !msg ||
      (msg.role !== "user" && msg.role !== "assistant") ||
      !isString(msg.content) ||
      msg.content.length > MAX_MESSAGE_LENGTH
    ) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Each message must have a valid role and content (max ${MAX_MESSAGE_LENGTH} chars).`,
        },
      });
    }
  }

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
        : messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

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
