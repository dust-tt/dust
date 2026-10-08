import { mintLiveTicket } from "@app/lib/api/collab/tickets";
import type { PostCollabTicketResponseBody } from "@app/types/api/file_system/types";
import { liveAccessErrorToApiError } from "@front-api/lib/collab/live_access_errors";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
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
      return apiError(ctx, liveAccessErrorToApiError(ticket.error));
    }
    return ctx.json({ ticket: ticket.value });
  }
);

export default app;
