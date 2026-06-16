import config from "@app/lib/api/config";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DustFileSystemError } from "@app/lib/api/file_system/types";
import {
  convertCanonicalFileToPdf,
  deleteCanonicalFile,
  moveCanonicalFile,
  renameCanonicalFile,
  streamThumbnail,
} from "@app/lib/api/files/file_system_ops";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import path from "path";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  canonicalPath: z.string(),
});

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
    return { fs: null, err: apiError(ctx, mapDustFsError(fsResult.error)) };
  }

  return { fs: fsResult.value, err: null };
}

/** @ignoreswagger */
app.get("/:canonicalPath{.+}", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { canonicalPath } = ctx.req.valid("param");
  const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
  if (err) {
    return err;
  }

  const thumbnail = ctx.req.query("thumbnail");
  const download = ctx.req.query("download");
  const previewPdf = ctx.req.query("preview") === "pdf";

  // ?preview=pdf converts Office files to PDF via Gotenberg's LibreOffice route.
  if (previewPdf) {
    const rendererUrl = config.getDocumentRendererUrl();
    if (!rendererUrl) {
      return apiError(ctx, {
        status_code: 503,
        api_error: {
          type: "internal_server_error",
          message: "PDF preview is not configured.",
        },
      });
    }

    const conversionResult = await convertCanonicalFileToPdf(
      dustFs,
      canonicalPath,
      rendererUrl
    );
    if (conversionResult.isErr()) {
      const e = conversionResult.error;

      switch (e.code) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "file_not_found", message: e.message },
          });

        case "too_large":
          return apiError(ctx, {
            status_code: 413,
            api_error: { type: "invalid_request_error", message: e.message },
          });

        case "unsupported_type":
          return apiError(ctx, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message: e.message },
          });

        case "conversion_failed":
        case "internal":
          return apiError(ctx, {
            status_code: 500,
            api_error: { type: "internal_server_error", message: e.message },
          });

        default:
          assertNever(e.code);
      }
    }

    const { pdfBuffer, pdfFileName } = conversionResult.value;
    // RFC 5987: filename= must be ASCII-safe; filename*= carries the UTF-8 encoded name.
    const asciiFallback = pdfFileName.replace(/[^\x20-\x7E]/g, "_");
    const encodedName = encodeURIComponent(pdfFileName);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

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
    return apiError(ctx, mapDustFsError(statResult.error));
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
    return apiError(ctx, mapDustFsError(readResult.error));
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

  return new Response(readableToReadableStream(nodeStream), {
    status: 200,
    headers,
  });
});

app.on(
  "HEAD",
  "/:canonicalPath{.+}",
  validate("param", ParamsSchema),
  async (ctx) => {
    const { canonicalPath } = ctx.req.valid("param");
    const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
    if (err) {
      return err;
    }

    const statResult = await dustFs.stat(canonicalPath);
    if (statResult.isErr()) {
      return apiError(ctx, mapDustFsError(statResult.error));
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
  }
);

app.patch(
  "/:canonicalPath{.+}",
  validate("param", ParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { canonicalPath } = ctx.req.valid("param");
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
          return apiError(ctx, mapDustFsError(renameResult.error));
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
          return apiError(ctx, mapDustFsError(moveResult.error));
        }
        break;
      }

      default:
        assertNever(data);
    }

    return new Response(null, { status: 200 });
  }
);

app.delete(
  "/:canonicalPath{.+}",
  validate("param", ParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { canonicalPath } = ctx.req.valid("param");
    const { fs: dustFs, err } = await resolveFs(ctx, canonicalPath);
    if (err) {
      return err;
    }

    const deleteResult = await deleteCanonicalFile(auth, dustFs, canonicalPath);
    if (deleteResult.isErr()) {
      return apiError(ctx, mapDustFsError(deleteResult.error));
    }

    return new Response(null, { status: 204 });
  }
);

function mapDustFsError(err: DustFileSystemError) {
  switch (err.code) {
    case "not_found":
      return {
        status_code: 404,
        api_error: { type: "file_not_found", message: err.message },
      } as const;

    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: err.message },
      } as const;

    case "invalid_path":
    case "legacy_path":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: err.message },
      } as const;

    case "already_exists":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message: err.message },
      } as const;

    case "too_many_mounts":
    case "internal":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message: err.message },
      } as const;

    default:
      assertNever(err.code);
  }
}

export default app;
