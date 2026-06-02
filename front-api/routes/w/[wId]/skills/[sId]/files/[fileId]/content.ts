import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  sId: z.string(),
  fileId: z.string(),
});

// Mounted at /api/w/:wId/skills/:sId/files/:fileId/content.
const app = workspaceApp();

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { sId, fileId } = ctx.req.valid("param");

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
  const webStream = readableToReadableStream(readStream);
  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": file.contentType },
  });
});

export default app;
