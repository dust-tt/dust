import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  type FileSystemEntry,
  SCOPED_PREFIX_CONVERSATION,
} from "@app/lib/api/file_system/types";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import rel from "./[...rel]";
import download from "./download";
import thumbnail from "./thumbnail";

export type GetConversationFilesResponseBody = {
  files: FileSystemEntry[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/files.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetConversationFilesResponseBody> => {
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

  const fsResult = await DustFileSystem.forConversation(
    auth,
    conversation.toJSON()
  );
  if (fsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to initialise file system.",
      },
    });
  }

  // Scope the listing to the conversation mount only. For pod conversations the
  // DustFileSystem also has a pod mount and we do not want to expose pod files here.
  const dustFs = fsResult.value;
  const files = await enrichListWithFileResourceIds(
    auth,
    dustFs,
    await dustFs.list(`${SCOPED_PREFIX_CONVERSATION}${cId}`)
  );

  return ctx.json({ files });
});

app.route("/download", download);
app.route("/thumbnail", thumbnail);

// Catch-all for /files/<...rel> — must be last.
app.route("/", rel);

export default app;
