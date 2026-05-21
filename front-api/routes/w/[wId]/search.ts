import { handleSearch, SearchRequestBody } from "@app/lib/api/search";
import { streamToolFiles } from "@app/lib/search/tools/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { SearchWarningCode } from "@app/types/core/core_api";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { fromError } from "zod-validation-error";

type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

interface UnifiedSearchStreamChunk {
  knowledgeResults?: {
    nodes: DataSourceContentNode[];
    warningCode: SearchWarningCode | null;
    nextPageCursor: string | null;
    resultsCount: number | null;
  };
  toolResults?: ToolSearchResult[];
}

// Mounted at /api/w/:wId/search.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const {
    query,
    limit: limitParam,
    cursor,
    viewType = "all",
    spaceIds: spaceIdsParam,
    excludeNonRemoteDatabaseTables: excludeNonRemoteDatabaseTablesParam,
    includeDataSources = "true",
    searchSourceUrls,
    includeTools = "true",
    prioritizeSpaceAccess = "false",
  } = ctx.req.query();

  const limit = isString(limitParam) ? parseInt(limitParam, 10) : 25;

  if (isNaN(limit) || limit < 1 || limit > 100) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "limit must be a number between 1 and 100.",
      },
    });
  }

  const searchParamsInput = {
    query: isString(query) ? query : undefined,
    viewType: isString(viewType) ? viewType : "all",
    spaceIds:
      isString(spaceIdsParam) && spaceIdsParam.length > 0
        ? spaceIdsParam.split(",")
        : [],
    excludeNonRemoteDatabaseTables:
      excludeNonRemoteDatabaseTablesParam === "true",
    includeDataSources: includeDataSources === "true",
    limit,
    searchSourceUrls: searchSourceUrls === "true" ? true : undefined,
    prioritizeSpaceAccess: prioritizeSpaceAccess === "true",
  };

  const bodyValidation = SearchRequestBody.safeParse(searchParamsInput);
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request parameters: ${pathError}`,
      },
    });
  }

  const searchParams = bodyValidation.data;

  // Build a query-string-like object for handleSearch (it reads cursor/limit).
  const reqQuery: Record<string, string | undefined> = {};
  if (cursor) {
    reqQuery.cursor = cursor;
  }
  if (limitParam) {
    reqQuery.limit = limitParam;
  }

  ctx.header("Content-Type", "text/event-stream");
  ctx.header("Cache-Control", "no-cache");
  ctx.header("Connection", "keep-alive");
  ctx.header("X-Accel-Buffering", "no");
  ctx.header("Content-Encoding", "none");

  return stream(ctx, async (s) => {
    try {
      logger.info(
        {
          workspaceId: auth.workspace()?.sId,
          params: searchParams,
        },
        "Search knowledge (streaming)"
      );

      const searchResult = await handleSearch(reqQuery, auth, searchParams);

      if (searchResult.isErr()) {
        // Write the error as an SSE event so the client can handle it.
        await s.write(
          `data: ${JSON.stringify({ error: searchResult.error })}\n\n`
        );
        return;
      }

      if (s.aborted) {
        return;
      }

      const knowledgeChunk: UnifiedSearchStreamChunk = {
        knowledgeResults: searchResult.value,
      };
      await s.write(`data: ${JSON.stringify(knowledgeChunk)}\n\n`);

      if (
        includeTools === "true" &&
        !cursor &&
        !s.aborted &&
        isString(searchParams.query)
      ) {
        for await (const results of streamToolFiles({
          auth,
          query: searchParams.query,
          pageSize: searchParams.limit,
        })) {
          if (s.aborted) {
            break;
          }

          const toolChunk: UnifiedSearchStreamChunk = {
            toolResults: results,
          };
          await s.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        }
      }
    } catch (error) {
      logger.error(
        {
          error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Error in unified search"
      );
    }
  });
});

app.post("/", validate("json", SearchRequestBody), async (ctx) => {
  const auth = ctx.get("auth");
  const body = ctx.req.valid("json");

  // Build a query-string-like object for handleSearch (cursor pagination).
  const reqQuery: Record<string, string | undefined> = {
    cursor: ctx.req.query("cursor"),
    limit: ctx.req.query("limit"),
  };

  const searchResult = await handleSearch(reqQuery, auth, body);

  if (searchResult.isErr()) {
    return apiError(ctx, {
      status_code: searchResult.error.status,
      api_error: searchResult.error.error,
    });
  }

  return ctx.json(searchResult.value);
});

export default app;
