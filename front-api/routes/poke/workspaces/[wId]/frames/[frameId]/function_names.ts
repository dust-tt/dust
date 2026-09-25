import type {
  PokeGetFrameFunctionVersions,
  PokeListFrameFunctionNames,
} from "@app/lib/api/poke/frames";
import {
  listFrameFunctionNameInvocations,
  listFrameFunctionNames,
  listFrameFunctionVersions,
} from "@app/lib/api/poke/frames";
import type { PokeListSandboxFunctionInvocations } from "@app/lib/api/poke/sandbox_functions";
import {
  isValidSandboxFunctionSlug,
  SANDBOX_FUNCTION_INVOCATION_ORIGINS,
  SANDBOX_FUNCTION_INVOCATION_STATUSES,
} from "@app/types/api/sandbox_functions";
import { pokeFrameApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DEFAULT_INVOCATIONS_LIMIT = 25;
const MAX_INVOCATIONS_LIMIT = 200;

const SlugParamsSchema = z.object({
  slug: z.string().refine(isValidSandboxFunctionSlug),
});

const InvocationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_INVOCATIONS_LIMIT)
    .default(DEFAULT_INVOCATIONS_LIMIT),
  status: z.enum(SANDBOX_FUNCTION_INVOCATION_STATUSES).optional(),
  origin: z.enum(SANDBOX_FUNCTION_INVOCATION_ORIGINS).optional(),
});

const functionNameNotFound = {
  status_code: 404,
  api_error: {
    type: "sandbox_function_not_found",
    message: "No function of this name in the Frame.",
  },
} as const;

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/function-names. A Frame function's name is
// stable across publications; each publication that declares it adds a version with its own sId.
const app = pokeFrameApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListFrameFunctionNames> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");

  return ctx.json({ items: await listFrameFunctionNames(auth, frame) });
});

/** @ignoreswagger */
app.get(
  "/:slug",
  validate("param", SlugParamsSchema),
  async (ctx): HandlerResult<PokeGetFrameFunctionVersions> => {
    const auth = ctx.get("auth");
    const frame = ctx.get("frame");
    const { slug } = ctx.req.valid("param");

    const versions = await listFrameFunctionVersions(auth, { frame, slug });
    if (versions.length === 0) {
      return apiError(ctx, functionNameNotFound);
    }

    return ctx.json({ slug, versions });
  }
);

/** @ignoreswagger */
app.get(
  "/:slug/invocations",
  validate("param", SlugParamsSchema),
  validate("query", InvocationsQuerySchema),
  async (ctx): HandlerResult<PokeListSandboxFunctionInvocations> => {
    const auth = ctx.get("auth");
    const frame = ctx.get("frame");
    const { slug } = ctx.req.valid("param");
    const { limit, status, origin } = ctx.req.valid("query");

    const items = await listFrameFunctionNameInvocations(auth, {
      frame,
      limit,
      origins: origin ? [origin] : undefined,
      slug,
      statuses: status ? [status] : undefined,
    });
    if (!items) {
      return apiError(ctx, functionNameNotFound);
    }

    return ctx.json({ items });
  }
);

export default app;
