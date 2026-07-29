import { getFeatureFlags } from "@app/lib/auth";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  type GetConversationGoalResponseBody,
  GoalBranchSchema,
} from "@app/types/api/assistant/goal";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/goal:
 *   get:
 *     summary: Get the latest conversation goal
 *     description: Return the latest Goal Mode goal for the requested conversation branch.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: branchId
 *         required: false
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Latest goal, or null when the branch has no goal.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 goal:
 *                   type: object
 *                   nullable: true
 *                   allOf:
 *                     - $ref: '#/components/schemas/PrivateGoal'
 *       403:
 *         description: Goal Mode is not enabled for the workspace.
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", GoalBranchSchema),
  async (ctx): HandlerResult<GetConversationGoalResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const branchId = ctx.req.valid("query").branchId ?? null;
    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("goal_mode")) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Goal Mode is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, cId);
    const branch = branchId
      ? await ConversationBranchResource.fetchById(auth, branchId)
      : null;
    if (
      !conversation ||
      (branchId && (!branch || branch.conversationId !== conversation.id))
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation or branch not found.",
        },
      });
    }

    const goal = await ConversationGoalResource.fetchLatest(auth, {
      conversation,
      branchId,
    });
    return ctx.json({ goal: goal?.toJSON() ?? null });
  }
);

export default app;
