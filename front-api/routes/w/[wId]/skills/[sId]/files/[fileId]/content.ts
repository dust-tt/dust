import { Hono } from "hono";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isString } from "@app/types/shared/utils/general";

// Mounted at /api/w/:wId/skills/:sId/files/:fileId/content.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId");
  const fileId = c.req.param("fileId");

  if (!isString(sId)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid skill ID.",
        },
      },
      400
    );
  }

  if (!isString(fileId)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid file ID.",
        },
      },
      400
    );
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return c.json(
      {
        error: { type: "file_not_found", message: "File not found." },
      },
      404
    );
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (
    !file ||
    file.useCase !== "skill_attachment" ||
    file.useCaseMetadata?.skillId !== sId
  ) {
    return c.json(
      {
        error: { type: "file_not_found", message: "File not found." },
      },
      404
    );
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
