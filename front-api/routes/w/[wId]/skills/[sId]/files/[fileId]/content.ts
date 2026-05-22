import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";

// Mounted at /api/w/:wId/skills/:sId/files/:fileId/content.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");
  const fileId = ctx.req.param("fileId");

  if (!isString(sId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  if (!isString(fileId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid file ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (
    !file ||
    file.useCase !== "skill_attachment" ||
    file.useCaseMetadata?.skillId !== sId
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const readStream = file.getReadStream({ auth, version: "original" });
  const webStream = Readable.toWeb(
    readStream
  ) as NodeReadableStream<Uint8Array>;
  return new Response(webStream as unknown as ReadableStream, {
    status: 200,
    headers: { "Content-Type": file.contentType },
  });
});

export default app;
