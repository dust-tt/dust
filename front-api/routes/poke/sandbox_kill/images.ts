import { getRegisteredImages } from "@app/lib/api/sandbox/image";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export interface SandboxKillImagesResponseBody {
  images: Array<{ baseImage: string; version: string }>;
}

// Mounted at /api/poke/sandbox_kill/images.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<SandboxKillImagesResponseBody> => {
  const images = getRegisteredImages()
    .map((image) => image.imageId)
    .filter((id): id is { imageName: string; tag: string } => id !== undefined)
    .map(({ imageName, tag }) => ({ baseImage: imageName, version: tag }));

  return ctx.json({ images });
});

export default app;
