import { FileResource } from "@app/lib/resources/file_resource";
import type { FileTypeWithMetadata } from "@app/types/files";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export interface GetPokeFileResponseBody {
  content: string;
  file: FileTypeWithMetadata;
}

// Mounted at /api/poke/workspaces/:wId/files/:sId.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetPokeFileResponseBody> => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");
  if (!sId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The sId parameter is required.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, sId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only allow access to interactive content files (frames).
  if (!file.isInteractiveContent) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only interactive content files can be viewed.",
      },
    });
  }

  const readStream = file.getReadStream({ auth, version: "original" });
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString("utf-8");

  return ctx.json({
    file: file.toJSONWithMetadata(auth),
    content,
  });
});

export default app;
