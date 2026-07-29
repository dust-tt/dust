import { pauseGoalByUser } from "@app/lib/api/assistant/goal_mode";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import {
  ConversationGoalResource,
  type GoalTransitionError,
} from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  type GetConversationGoalResponseBody,
  GoalBranchSchema,
  PatchConversationGoalRequestBodySchema,
  type PatchConversationGoalResponseBody,
} from "@app/types/api/assistant/goal";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const app = workspaceApp();

async function isValidBranch(
  auth: Authenticator,
  conversation: ConversationResource,
  branchId: string | null
): Promise<boolean> {
  if (!branchId) {
    return true;
  }
  const branch = await ConversationBranchResource.fetchById(auth, branchId);
  return branch?.conversationId === conversation.id;
}

function apiErrorForTransition(
  ctx: Parameters<typeof apiError>[0],
  error: GoalTransitionError
) {
  switch (error.type) {
    case "goal_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "No goal exists for this conversation branch.",
        },
      });
    case "forbidden":
    case "wrong_agent":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only the user who created this goal can update it.",
        },
      });
    case "goal_conflict":
    case "invalid_transition":
      return apiError(ctx, {
        status_code: 409,
        api_error: {
          type: "invalid_request_error",
          message: "This goal cannot perform the requested transition.",
        },
      });
    default:
      return assertNever(error.type);
  }
}

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
 *               required: [goal, canManage]
 *               properties:
 *                 goal:
 *                   type: object
 *                   nullable: true
 *                   allOf:
 *                     - $ref: '#/components/schemas/PrivateGoal'
 *                 canManage:
 *                   type: boolean
 *       403:
 *         description: Goal Mode is not enabled for the workspace.
 *   patch:
 *     summary: Pause a conversation goal
 *     description: Pause automatic continuation for the latest active Goal Mode goal on a conversation branch.
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
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [pause]
 *               branchId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated goal.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [goal, canManage]
 *               properties:
 *                 goal:
 *                   $ref: '#/components/schemas/PrivateGoal'
 *                 canManage:
 *                   type: boolean
 *       403:
 *         description: Goal Mode is disabled or the caller does not own the goal.
 *       404:
 *         description: Conversation, branch, or goal not found.
 *       409:
 *         description: Invalid or conflicting goal transition.
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", GoalBranchSchema),
  async (ctx): HandlerResult<GetConversationGoalResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const branchId = ctx.req.valid("query").branchId ?? null;
    if (!(await hasFeatureFlag(auth, "goal_mode"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Goal Mode is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation || !(await isValidBranch(auth, conversation, branchId))) {
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
    return ctx.json({
      goal: goal?.toJSON() ?? null,
      canManage: goal !== null && goal.createdByUserId === auth.user()?.id,
    });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchConversationGoalRequestBodySchema),
  async (ctx): HandlerResult<PatchConversationGoalResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");
    const { branchId: requestedBranchId } = ctx.req.valid("json");
    const branchId = requestedBranchId ?? null;

    if (!(await hasFeatureFlag(auth, "goal_mode"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Goal Mode is not enabled for this workspace.",
        },
      });
    }

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation || !(await isValidBranch(auth, conversation, branchId))) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation or branch not found.",
        },
      });
    }

    const result = await pauseGoalByUser(auth, {
      conversation,
      branchId,
    });
    if (result.isErr()) {
      return apiErrorForTransition(ctx, result.error);
    }

    return ctx.json({ goal: result.value.toJSON(), canManage: true });
  }
);

export default app;
