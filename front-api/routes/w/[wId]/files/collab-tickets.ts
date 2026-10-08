import { mintLiveTicket } from "@app/lib/api/collab/tickets";
import type { PostCollabTicketResponseBody } from "@app/types/api/file_system/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { workspaceAccessErrorToApiError } from "@front-api/middlewares/workspace_auth";
import { z } from "zod";

// Mounted at /api/w/:wId/files/collab-tickets.
const app = workspaceApp();

const PostBodySchema = z.object({
  filePath: z.string().min(1),
});

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostBodySchema),
  async (ctx): HandlerResult<PostCollabTicketResponseBody> => {
    const ticket = await mintLiveTicket(
      ctx.get("auth"),
      ctx.req.valid("json").filePath
    );
    if (ticket.isErr()) {
      switch (ticket.error.code) {
        case "not_member":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: ticket.error.message,
            },
          });
        case "workspace_unavailable":
          return apiError(
            ctx,
            workspaceAccessErrorToApiError(ticket.error.workspaceError)
          );
        case "not_available":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "feature_flag_not_found",
              message: ticket.error.message,
            },
          });
        case "invalid_path":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: ticket.error.message,
            },
          });
        case "unavailable":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: ticket.error.message,
            },
          });
        case "read_only":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "file_read_only",
              message: ticket.error.message,
            },
          });
        case "not_markdown":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "file_type_not_supported",
              message: ticket.error.message,
            },
          });
        case "too_large":
          return apiError(ctx, {
            status_code: 413,
            api_error: {
              type: "file_too_large",
              message: ticket.error.message,
            },
          });
        default:
          assertNever(ticket.error);
      }
    }
    return ctx.json({ ticket: ticket.value });
  }
);

export default app;
