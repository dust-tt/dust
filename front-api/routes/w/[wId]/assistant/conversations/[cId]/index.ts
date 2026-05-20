import { deleteOrLeaveConversation } from "@app/lib/api/assistant/conversation";
import { updateConversationTitle } from "@app/lib/api/assistant/conversation/title";
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
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import attachments from "./attachments";
import cancel from "./cancel";
import compactions from "./compactions";
import contextUsage from "./context-usage";
import feedbacks from "./feedbacks";
import onboardingFollowup from "./onboarding-followup";
import participants from "./participants";
import planMode from "./plan_mode";
import skills from "./skills";
import suggest from "./suggest";
import tools from "./tools";

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
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";

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
    return apiErrorForConversation(c, error);
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

  return c.json({ conversation });
});

app.delete("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";
  const forceDelete = c.req.query("forceDelete") === "true";

  const result = await deleteOrLeaveConversation(auth, {
    conversationId: cId,
    forceDelete,
  });
  if (result.isErr()) {
    return apiErrorForConversation(c, result.error);
  }

  return c.body(null, 200);
});

app.patch(
  "/",
  validate("json", PatchConversationsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const cId = c.req.param("cId") ?? "";

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(c, conversationRes.error);
    }

    const conversation = conversationRes.value;
    const data = c.req.valid("json");

    if ("title" in data) {
      const result = await updateConversationTitle(auth, {
        conversationId: conversation.sId,
        title: data.title,
      });
      await ConversationResource.markAsReadForAuthUser(auth, { conversation });

      if (result.isErr()) {
        return apiErrorForConversation(c, result.error);
      }
      return c.json({ success: true });
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
      return c.json({ success: true });
    }

    if ("spaceId" in data) {
      const r = await moveConversationToProject(auth, {
        conversation,
        spaceId: data.spaceId,
      });
      if (r.isOk()) {
        return c.json({ success: true });
      }
      switch (r.error.code) {
        case "unauthorized":
          return apiError(c, {
            status_code: 404,
            api_error: { type: "user_not_found", message: r.error.message },
          });
        case "space_not_found":
          return apiError(c, {
            status_code: 404,
            api_error: { type: "space_not_found", message: "Space not found" },
          });
        case "conversation_not_found":
          return apiError(c, {
            status_code: 404,
            api_error: {
              type: "conversation_not_found",
              message: "Conversation not found",
            },
          });
        case "internal_error":
          return apiError(c, {
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

    if ("accessMode" in data) {
      const result = await ConversationResource.updateUrlAccessMode(
        auth,
        conversation.sId,
        data.accessMode
      );
      if (result.isErr()) {
        return apiErrorForConversation(c, result.error);
      }
      return c.json({ success: true });
    }

    if ("removeFromProject" in data) {
      const r = await moveConversationOutOfProject(auth, { conversation });
      if (r.isOk()) {
        return c.json({ success: true });
      }
      switch (r.error.code) {
        case "unauthorized":
          return apiError(c, {
            status_code: 404,
            api_error: { type: "user_not_found", message: r.error.message },
          });
        case "space_not_found":
          return apiError(c, {
            status_code: 404,
            api_error: { type: "space_not_found", message: "Space not found" },
          });
        case "conversation_not_found":
          return apiError(c, {
            status_code: 404,
            api_error: {
              type: "conversation_not_found",
              message: "Conversation not found",
            },
          });
        case "internal_error":
          return apiError(c, {
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

    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  }
);

app.route("/attachments", attachments);
app.route("/cancel", cancel);
app.route("/compactions", compactions);
app.route("/context-usage", contextUsage);
app.route("/feedbacks", feedbacks);
app.route("/onboarding-followup", onboardingFollowup);
app.route("/participants", participants);
app.route("/plan_mode", planMode);
app.route("/skills", skills);
app.route("/suggest", suggest);
app.route("/tools", tools);

export default app;
