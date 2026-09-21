import { createLiveSession } from "@app/lib/api/assistant/live";
import { LiveSessionRequestSchema } from "@app/types/assistant/live";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/live:
 *   post:
 *     summary: Start a GPT-Live voice session for a conversation
 *     description: Feature-gated POC. Exchanges a WebRTC offer for an answer using server-owned credentials and client delegation to the existing Dust agent harness.
 *     tags: [Private Conversations]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: wId, required: true, schema: { type: string } }
 *       - { in: path, name: cId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId, sdp]
 *             properties:
 *               agentId: { type: string, minLength: 1 }
 *               sdp: { type: string, minLength: 1, maxLength: 65536 }
 *     responses:
 *       201:
 *         description: Voice session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [session, transport]
 *               properties:
 *                 session:
 *                   type: object
 *                   required: [id]
 *                   properties:
 *                     id: { type: string }
 *                 transport:
 *                   type: object
 *                   required: [type, sdp]
 *                   properties:
 *                     type: { type: string, enum: [webrtc] }
 *                     sdp: { type: string }
 *       400: { description: Invalid offer or unavailable configuration }
 *       401: { description: Authentication required }
 *       403: { description: Voice is not enabled }
 *       404: { description: Conversation or agent not accessible }
 *       502: { description: OpenAI session creation failed }
 */
app.post(
  "/",
  validate("param", z.object({ cId: z.string() })),
  validate("json", LiveSessionRequestSchema),
  async (ctx) => {
    const result = await createLiveSession(ctx.get("auth"), {
      conversationId: ctx.req.valid("param").cId,
      ...ctx.req.valid("json"),
    });
    if (result.isErr()) {
      const statusCodes = {
        disabled: 403,
        not_found: 404,
        configuration: 400,
        provider: 502,
      } as const;
      return apiError(ctx, {
        status_code: statusCodes[result.error.type],
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }
    return ctx.json(result.value, 201);
  }
);

export default app;
