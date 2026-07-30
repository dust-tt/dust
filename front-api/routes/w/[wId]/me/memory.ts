import type { DustFileSystemError } from "@app/lib/api/file_system/dust_file_system";
import {
  exceedsUserMemoryLimit,
  getUserMemory,
  isUserMemoryEnabled,
  MAX_USER_MEMORY_CHARS,
  setUserMemory,
  setUserMemoryEnabled,
} from "@app/lib/api/user_memory";
import type {
  GetUserMemoryResponseBody,
  PatchUserMemoryResponseBody,
} from "@app/types/api/me/memory";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import type { Context } from "hono";
import { z } from "zod";

const PatchMemoryBodySchema = z
  .object({
    content: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => body.content !== undefined || body.enabled !== undefined, {
    message: "At least one field must be provided",
  });

// The path is internally built and always valid, so no client-side filesystem
// error (not_found, invalid_path, already_exists, ...) is reachable here: the
// only outcomes are `unauthorized` (403) or a genuine GCS/internal failure (500).
function fileSystemApiError(ctx: Context, error: DustFileSystemError) {
  if (error.code === "unauthorized") {
    return apiError(ctx, {
      status_code: 403,
      api_error: { type: "workspace_auth_error", message: error.message },
    });
  }
  return apiError(ctx, {
    status_code: 500,
    api_error: { type: "internal_server_error", message: error.message },
  });
}

// Mounted at /api/w/:wId/me/memory. Always scoped to the authenticated user's
// own memory (via DustFileSystem.forUser). `enabled` is a field of the memory
// resource rather than a sub-resource with its own path.
const app = workspaceApp();

app.use(withFeatureFlag("user_memory"));

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetUserMemoryResponseBody> => {
  const auth = ctx.get("auth");

  const result = await getUserMemory(auth);
  if (result.isErr()) {
    return fileSystemApiError(ctx, result.error);
  }

  const enabled = await isUserMemoryEnabled(auth);

  return ctx.json({ content: result.value, enabled });
});

/** @ignoreswagger */
app.patch(
  "/",
  validate("json", PatchMemoryBodySchema),
  async (ctx): HandlerResult<PatchUserMemoryResponseBody> => {
    const auth = ctx.get("auth");
    const { content: contentInput, enabled: enabledInput } =
      ctx.req.valid("json");

    if (contentInput !== undefined) {
      if (exceedsUserMemoryLimit(contentInput)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Memory content exceeds the ${MAX_USER_MEMORY_CHARS} character limit.`,
          },
        });
      }

      const result = await setUserMemory(auth, contentInput);
      if (result.isErr()) {
        return fileSystemApiError(ctx, result.error);
      }
    }

    let content = contentInput;
    if (content === undefined) {
      const result = await getUserMemory(auth);
      if (result.isErr()) {
        return fileSystemApiError(ctx, result.error);
      }
      content = result.value;
    }

    if (enabledInput !== undefined) {
      await setUserMemoryEnabled(auth, enabledInput);
    }

    let enabled = enabledInput;
    if (enabled === undefined) {
      enabled = await isUserMemoryEnabled(auth);
    }

    return ctx.json({ content, enabled });
  }
);

export default app;
