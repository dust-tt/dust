import {
  getRegisteredImages,
  type SandboxKillImagesResponseBody,
} from "@app/lib/api/sandbox/image";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/sandbox_kill/images.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<SandboxKillImagesResponseBody> => {
  const images = getRegisteredImages()
    .map((image) => image.imageId)
    .filter((id): id is { imageName: string; tag: string } => id !== undefined)
    .map(({ imageName, tag }) => ({ baseImage: imageName, version: tag }));

  return ctx.json({ images });
});

export default app;
