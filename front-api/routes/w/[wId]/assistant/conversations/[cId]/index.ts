import { deleteOrLeaveConversation } from "@app/lib/api/assistant/conversation";
import { updateConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type {
  GetConversationResponseBody,
  PatchConversationResponseBody,
} from "@app/lib/api/assistant/conversation/types";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  moveConversationOutOfProject,
  moveConversationToProject,
} from "@app/lib/api/projects/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationError } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import actions from "./actions";
import attachments from "./attachments";
import branches from "./branches";
import cancel from "./cancel";
import compactions from "./compactions";
import contentFragment from "./content_fragment";
import contextUsage from "./context-usage";
import events from "./events";
import feedbacks from "./feedbacks";
import files from "./files";
import forks from "./forks";
import mentions from "./mentions";
import messages from "./messages";
import onboardingFollowup from "./onboarding-followup";
import participants from "./participants";
import planMode from "./plan_mode";
import sandbox from "./sandbox";
import skills from "./skills";
import suggest from "./suggest";
import tools from "./tools";
import wakeups from "./wakeups";

const ParamsSchema = z.object({
  cId: z.string(),
});

const PatchConversationsRequestBodySchema = z.union([
  z.object({ title: z.string() }),
  z.object({ read: z.boolean() }),
  z.object({ spaceId: z.string() }),
  z.object({
    accessMode: z.enum(["participants_only", "workspace_members"]),
  }),
  z.object({ removeFromProject: z.literal(true) }),
]);

// Mounted under /api/w/:wId/assistant/conversations/:cId. The bare `/`
// handles GET, DELETE, and PATCH on the conversation resource itself.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}:
 *   get:
 *     summary: Get a conversation
 *     description: Retrieve a specific conversation by its ID.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversation:
 *                   $ref: '#/components/schemas/PrivateConversation'
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete or leave a conversation
 *     description: Delete a conversation or leave it if it is shared.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully deleted or left conversation
 *       401:
 *         description: Unauthorized
 *   patch:
 *     summary: Update a conversation
 *     description: Update a conversation's title, mark it as read, move it to a different space, or control URL access mode.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - title
 *                 properties:
 *                   title:
 *                     type: string
 *               - type: object
 *                 required:
 *                   - read
 *                 properties:
 *                   read:
 *                     type: boolean
 *               - type: object
 *                 required:
 *                   - spaceId
 *                 properties:
 *                   spaceId:
 *                     type: string
 *               - type: object
 *                 required:
 *                   - accessMode
 *                 properties:
 *                   accessMode:
 *                     type: string
 *                     enum:
 *                       - participants_only
 *                       - workspace_members
 *     responses:
 *       200:
 *         description: Successfully updated conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId, {
        includeForkingData: true,
      });

    if (conversationRes.isErr()) {
      // Distinguish between "not found" and "access restricted" for the UI.
      const canAccess = await ConversationResource.canAccess(auth, cId);
      const error =
        canAccess === "conversation_access_restricted"
          ? new ConversationError("conversation_access_restricted")
          : conversationRes.error;
      return apiErrorForConversation(ctx, error);
    }

    const conversation = conversationRes.value;

    void emitAuditLogEvent({
      auth,
      action: "conversation.accessed",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("conversation", {
          sId: conversation.sId,
          name: conversation.title ?? "",
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        conversation_id: conversation.sId,
      },
    });

    return ctx.json({ conversation });
  }
);

app.delete("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId } = ctx.req.valid("param");
  const forceDelete = ctx.req.query("forceDelete") === "true";

  const result = await deleteOrLeaveConversation(auth, {
    conversationId: cId,
    forceDelete,
  });
  if (result.isErr()) {
    return apiErrorForConversation(ctx, result.error);
  }

  return ctx.body(null, 200);
});

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchConversationsRequestBodySchema),
  async (ctx): HandlerResult<PatchConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;
    const data = ctx.req.valid("json");

    if ("title" in data) {
      const result = await updateConversationTitle(auth, {
        conversationId: conversation.sId,
        title: data.title,
      });
      await ConversationResource.markAsReadForAuthUser(auth, { conversation });

      if (result.isErr()) {
        return apiErrorForConversation(ctx, result.error);
      }
      return ctx.json({ success: true });
    }

    if ("read" in data) {
      if (data.read) {
        await ConversationResource.markAsReadForAuthUser(auth, {
          conversation,
        });
      } else {
        await ConversationResource.markAsUnreadForAuthUser(auth, {
          conversation,
        });
      }
      return ctx.json({ success: true });
    }

    if ("spaceId" in data) {
      const r = await moveConversationToProject(auth, {
        conversation,
        spaceId: data.spaceId,
      });
      if (r.isOk()) {
        return ctx.json({ success: true });
      }
      switch (r.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "user_not_found", message: r.error.message },
          });
        case "space_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "space_not_found", message: "Space not found" },
          });
        case "conversation_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "conversation_not_found",
              message: "Conversation not found",
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Internal server error",
            },
          });
        case "conversation_agent_running":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "conversation_agent_running",
              message: r.error.message,
            },
          });
        default:
          assertNever(r.error.code);
      }
    }

    if ("accessMode" in data) {
      const result = await ConversationResource.updateUrlAccessMode(
        auth,
        conversation.sId,
        data.accessMode
      );
      if (result.isErr()) {
        return apiErrorForConversation(ctx, result.error);
      }
      return ctx.json({ success: true });
    }

    if ("removeFromProject" in data) {
      const r = await moveConversationOutOfProject(auth, { conversation });
      if (r.isOk()) {
        return ctx.json({ success: true });
      }
      switch (r.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "user_not_found", message: r.error.message },
          });
        case "space_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "space_not_found", message: "Space not found" },
          });
        case "conversation_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "conversation_not_found",
              message: "Conversation not found",
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Internal server error",
            },
          });
        default:
          assertNever(r.error.code);
      }
    }

    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  }
);

app.route("/actions", actions);
app.route("/attachments", attachments);
app.route("/branches", branches);
app.route("/cancel", cancel);
app.route("/compactions", compactions);
app.route("/content_fragment", contentFragment);
app.route("/context-usage", contextUsage);
app.route("/events", events);
app.route("/feedbacks", feedbacks);
app.route("/files", files);
app.route("/forks", forks);
app.route("/mentions", mentions);
app.route("/messages", messages);
app.route("/onboarding-followup", onboardingFollowup);
app.route("/participants", participants);
app.route("/plan_mode", planMode);
app.route("/sandbox", sandbox);
app.route("/skills", skills);
app.route("/suggest", suggest);
app.route("/tools", tools);
app.route("/wakeups", wakeups);

export default app;
