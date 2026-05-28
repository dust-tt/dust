import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { mapFsError } from "@app/lib/api/files/file_system_http_errors";
import {
  moveCanonicalFile,
  renameCanonicalFile,
  streamThumbnail,
} from "@app/lib/api/files/file_system_ops";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import path from "path";
import { z } from "zod";
import { fromError } from "zod-validation-error";

/**
 * Unified file system API by canonical scoped path.
 *
 *   GET    /api/w/:wId/files/path/conversation-{cId}/report.pdf         stream inline
 *   GET    /api/w/:wId/files/path/pod-{pId}/data.csv?download=1         stream + Content-Disposition
 *   GET    /api/w/:wId/files/path/conversation-{cId}/photo.png?thumbnail=1  stream thumbnail
 *   HEAD   /api/w/:wId/files/path/{...canonicalPath}                    metadata only
 *   PATCH  /api/w/:wId/files/path/{...canonicalPath}  { action:"rename", fileName }
 *   PATCH  /api/w/:wId/files/path/{...canonicalPath}  { action:"move",   dest }
 *   DELETE /api/w/:wId/files/path/{...canonicalPath}
 *
 * Mirrors pages/api/w/[wId]/files/path/[...canonicalPath].ts
 */
const app = workspaceApp();

const PatchBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    fileName: z
      .string()
      .min(1)
      .refine((v) => !v.includes("/") && !v.includes("\\"), {
        message: "fileName must not contain path separators.",
      }),
  }),
  z.object({
    action: z.literal("move"),
    dest: z.string().min(1),
  }),
]);

/** Resolve and validate the canonical path from the URL, returning an error response if invalid. */
async function resolveFs(
  ctx: Context<WorkspaceAwareCtx>,
  canonicalPath: string
) {
  if (!canonicalPath || !canonicalPath.includes("/")) {
    return {
      fs: null,
      err: apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid canonical path: expected at least two path segments " +
            "(e.g. /files/path/conversation-{id}/file.txt).",
        },
      }),
    };
  }

  const auth = ctx.get("auth");
  const fsResult = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (fsResult.isErr()) {
    return { fs: null, err: apiError(ctx, mapFsError(fsResult.error)) };
  }

  return { fs: fsResult.value, err: null };
}

app.get("/:canonicalPath{.+}", async (ctx) => {
  const auth = ctx.get("auth");
  const canonicalPath = ctx.req.param("canonicalPath");
  const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
  if (err) {
    return err;
  }

  const thumbnail = ctx.req.query("thumbnail");
  const download = ctx.req.query("download");

  // ?thumbnail=1 serves the resized/processed version (images only).
  if (thumbnail && thumbnail !== "0") {
    const thumbResult = await streamThumbnail(auth, dustFs, canonicalPath);
    if (thumbResult.isErr()) {
      const e = thumbResult.error;
      switch (e.code) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "file_not_found", message: e.message },
          });
        case "not_image":
          return apiError(ctx, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message: e.message },
          });
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: { type: "internal_server_error", message: e.message },
          });
        default:
          assertNever(e.code);
      }
    }

    const { stream, contentType } = thumbResult.value;
    return new Response(readableToReadableStream(stream), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Normal inline or attachment stream.
  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return apiError(ctx, mapFsError(statResult.error));
  }
  if (!statResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const { contentType } = statResult.value;

  const readResult = await dustFs.read(canonicalPath);
  if (readResult.isErr()) {
    return apiError(ctx, mapFsError(readResult.error));
  }
  if (!readResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const headers: Record<string, string> = { "Content-Type": contentType };

  // ?download=1 sets Content-Disposition: attachment.
  if (download && download !== "0") {
    const fileName = path.posix.basename(canonicalPath);
    headers["Content-Disposition"] =
      `attachment; filename="${encodeURIComponent(fileName)}"`;
  }

  const nodeStream = readResult.value;
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => {
        logger.error({ err, canonicalPath }, "Error streaming canonical file");
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, { status: 200, headers });
});

app.on("HEAD", "/:canonicalPath{.+}", async (ctx) => {
  const canonicalPath = ctx.req.param("canonicalPath");
  const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
  if (err) {
    return err;
  }

  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return apiError(ctx, mapFsError(statResult.error));
  }
  if (!statResult.value) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": statResult.value.contentType,
      "Content-Length": String(statResult.value.sizeBytes),
    },
  });
});

app.patch("/:canonicalPath{.+}", async (ctx) => {
  const auth = ctx.get("auth");
  const canonicalPath = ctx.req.param("canonicalPath");
  const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
  if (err) {
    return err;
  }

  let body: unknown;
  try {
    body = await ctx.req.json();
  } catch {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid JSON body.",
      },
    });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(parsed.error).toString(),
      },
    });
  }

  const data = parsed.data;

  switch (data.action) {
    case "rename": {
      const renameResult = await renameCanonicalFile(
        auth,
        dustFs,
        canonicalPath,
        data.fileName
      );
      if (renameResult.isErr()) {
        return apiError(ctx, mapFsError(renameResult.error));
      }
      break;
    }

    case "move": {
      if (data.dest === canonicalPath) {
        return new Response(null, { status: 200 });
      }
      const moveResult = await moveCanonicalFile(
        auth,
        dustFs,
        canonicalPath,
        data.dest
      );
      if (moveResult.isErr()) {
        return apiError(ctx, mapFsError(moveResult.error));
      }
      break;
    }

    default:
      assertNever(data);
  }

  return new Response(null, { status: 200 });
});

app.delete("/:canonicalPath{.+}", async (ctx) => {
  const canonicalPath = ctx.req.param("canonicalPath");
  const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
  if (err) {
    return err;
  }

  const deleteResult = await dustFs.delete(canonicalPath);
  if (deleteResult.isErr()) {
    return apiError(ctx, mapFsError(deleteResult.error));
  }

  return new Response(null, { status: 204 });
});

export default app;
