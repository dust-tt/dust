import {
  type GCSMountEntry,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import download from "./download";
import rel from "./rel";
import thumbnail from "./thumbnail";

export type GetConversationFilesResponseBody = {
  files: GCSMountEntry[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/files.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetConversationFilesResponseBody> => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";

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

    const files = await listGCSMountFiles(auth, {
      useCase: "conversation",
      conversationId: cId,
    });

    return ctx.json({ files });
  }
);

app.route("/download", download);
app.route("/thumbnail", thumbnail);

// Catch-all for /files/<...rel> — must be last.
app.route("/", rel);

export default app;
