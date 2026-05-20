import {
  type ResolveAuthenticationKind,
  ResolveAuthenticationSchema,
  resolveAuthentication,
} from "@app/lib/api/assistant/conversation/resolve_authentication";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

/**
 * Hono counterpart of `makeResolveAuthenticationHandler` from
 * `front/lib/api/assistant/conversation/resolve_authentication.ts`.
 * The two `resolve-*` routes only differ by the `kind` discriminant —
 * everything else (schema, error mapping) is identical, so the shared
 * shape lives here.
 */
export function makeResolveAuthenticationApp(
  kind: ResolveAuthenticationKind,
  label: string
) {
  const app = new Hono();

  app.post("/", validate("json", ResolveAuthenticationSchema), async (ctx) => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";
    const mId = ctx.req.param("mId") ?? "";

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const { actionId, outcome, resumeAncestorConversations } =
      ctx.req.valid("json");

    const result = await resolveAuthentication(auth, conversation, {
      actionId,
      messageId: mId,
      outcome,
      kind,
      resumeAncestorConversations,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "action_not_blocked":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        default:
          return apiError(
            ctx,
            {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Failed to resolve ${label}`,
              },
            },
            result.error
          );
      }
    }

    return ctx.json({ success: true });
  });

  return app;
}
