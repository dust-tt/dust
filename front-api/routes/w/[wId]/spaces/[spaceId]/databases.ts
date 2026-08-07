import {
  listDatabasesOnSandbox,
  listTablesOnSandbox,
  queryDatabaseOnSandbox,
  readTableRowsOnSandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  type GetPodDatabasesResponseBody,
  type GetPodDatabaseTablesResponseBody,
  type GetPodTableRowsResponseBody,
  MAX_TABLE_ROWS_PAGE_SIZE,
  type PostPodDatabaseQueryResponseBody,
} from "@app/types/api/sandbox/pod_databases";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import type { APIErrorType } from "@app/types/error";
import type { SpaceCtx } from "@front-api/middlewares/ctx";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSandboxFunctionsFeature } from "@front-api/middlewares/with_sandbox_functions_feature";
import { withSpace } from "@front-api/middlewares/with_space";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

// Mounted at /api/w/:wId/spaces/:spaceId/databases. A pod database is a live SQLite file inside
// the pod sandbox, so every route here runs `dsbx db ...` and wakes (or cold starts) the sandbox.
//
// Access control matches what `isEditor` serializes from on the space: canAdministrate. Workspace
// admins pass that on every space, so — as with the sibling `sandbox` routes — an admin who is not
// a member of a private pod can still read and write its databases.
const app = workspaceApp();

app.use("*", withSandboxFunctionsFeature());

const MAX_QUERY_SQL_LENGTH = 100_000;

/** Path params, validated against the same database-name shape the dsbx tools enforce. */
const DatabaseParamSchema = z.object({
  database: z.string().regex(POD_DATABASE_NAME_REGEX),
});

const TableParamSchema = DatabaseParamSchema.extend({
  table: z.string().min(1),
});

const TableRowsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_TABLE_ROWS_PAGE_SIZE)
    .default(MAX_TABLE_ROWS_PAGE_SIZE),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const QueryBodySchema = z.object({
  sql: z.string().min(1).max(MAX_QUERY_SQL_LENGTH),
});

/** Pod databases only exist on project spaces; anything else is a client mistake. */
const requirePodSpace = createMiddleware<SpaceCtx>(async (ctx, next) => {
  if (!ctx.get("space").isProject()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Pod databases are only available for project spaces.",
      },
    });
  }
  await next();
});

/**
 * Map a sandbox-function failure onto HTTP. `reconcile_blocked` is the code the dsbx error
 * mapping assigns to everything the caller can fix themselves (bad SQL, unknown database), so it
 * is the one that carries the runner's message straight back as a 400.
 */
function apiErrorForDbError(
  ctx: Context<SpaceCtx>,
  error: SandboxFunctionError
) {
  const [statusCode, type]: [400 | 404 | 500 | 503, APIErrorType] = (() => {
    switch (error.code) {
      case "reconcile_blocked":
        return [400, "invalid_request_error"];
      case "not_found":
        return [404, "table_not_found"];
      case "sandbox_unavailable":
        return [503, "service_unavailable"];
      default:
        return [500, "internal_server_error"];
    }
  })();

  return apiError(ctx, {
    status_code: statusCode,
    api_error: { type, message: error.message },
  });
}

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanAdministrate: true }),
  requirePodSpace,
  async (ctx): HandlerResult<GetPodDatabasesResponseBody> => {
    const result = await listDatabasesOnSandbox(ctx.get("auth"), {
      space: ctx.get("space"),
    });
    if (result.isErr()) {
      return apiErrorForDbError(ctx, result.error);
    }

    return ctx.json({ databases: result.value });
  }
);

/** @ignoreswagger */
app.get(
  "/:database/tables",
  withSpace({ requireCanAdministrate: true }),
  requirePodSpace,
  validate("param", DatabaseParamSchema),
  async (ctx): HandlerResult<GetPodDatabaseTablesResponseBody> => {
    const { database } = ctx.req.valid("param");

    const result = await listTablesOnSandbox(ctx.get("auth"), {
      space: ctx.get("space"),
      database,
    });
    if (result.isErr()) {
      return apiErrorForDbError(ctx, result.error);
    }

    return ctx.json({ tables: result.value });
  }
);

/** @ignoreswagger */
app.get(
  "/:database/tables/:table/rows",
  withSpace({ requireCanAdministrate: true }),
  requirePodSpace,
  validate("param", TableParamSchema),
  validate("query", TableRowsQuerySchema),
  async (ctx): HandlerResult<GetPodTableRowsResponseBody> => {
    const { database, table } = ctx.req.valid("param");
    const { limit, offset } = ctx.req.valid("query");

    const result = await readTableRowsOnSandbox(ctx.get("auth"), {
      space: ctx.get("space"),
      database,
      table,
      limit,
      offset,
    });
    if (result.isErr()) {
      return apiErrorForDbError(ctx, result.error);
    }

    return ctx.json(result.value);
  }
);

/** @ignoreswagger */
app.post(
  "/:database/query",
  withSpace({ requireCanAdministrate: true }),
  requirePodSpace,
  validate("param", DatabaseParamSchema),
  validate("json", QueryBodySchema),
  async (ctx): HandlerResult<PostPodDatabaseQueryResponseBody> => {
    const { database } = ctx.req.valid("param");

    const result = await queryDatabaseOnSandbox(ctx.get("auth"), {
      space: ctx.get("space"),
      database,
      sql: ctx.req.valid("json").sql,
    });
    if (result.isErr()) {
      return apiErrorForDbError(ctx, result.error);
    }

    const { columns, rows, rowCount, changes, note } = result.value;
    return ctx.json({ columns, rows, rowCount, changes, note });
  }
);

export default app;
