import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import type { PostCheckBigQueryLocationsResponseBody } from "@app/types/api/oauth";
import { PostCheckBigQueryRegionsRequestBodySchema } from "@app/types/api/oauth";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { BigQuery } from "@google-cloud/bigquery";

const app = workspaceApp();

app.use("*", ensureIsAdmin());

// @cc [label:performance] bigquery-locations-must-be-bounded
// Determining the connectable locations only requires each dataset's location and whether it
// holds at least one table. We must NOT paginate through every table of every dataset: real
// warehouses can hold hundreds of thousands of tables and doing so made this endpoint run for
// ~2 hours (#31964). Probe a single bounded page per dataset, fan out across datasets with
// capped concurrency, and race the whole enumeration against a hard timeout so a pathological
// project returns a clear error instead of an unbounded request.
const DATASET_CONCURRENCY = 16;
// One bounded page per dataset — enough to confirm presence and show a sample in the UI tooltip.
const MAX_TABLES_PER_DATASET = 50;
// Cap the sample surfaced per location to keep the response small on very wide projects.
const MAX_TABLES_PER_LOCATION = 50;
const ENUMERATION_TIMEOUT_MS = 60_000;

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostCheckBigQueryRegionsRequestBodySchema),
  async (ctx): HandlerResult<PostCheckBigQueryLocationsResponseBody> => {
    const { credentials } = ctx.req.valid("json");

    try {
      const bigquery = new BigQuery({
        credentials,
        scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
      });

      // Strict location listing: only expose actual dataset locations and only associate
      // tables to their dataset's exact location (no regional/multi-region expansion).
      const enumerate = async (): Promise<Record<string, Set<string>>> => {
        const [datasets] = await bigquery.getDatasets();

        const perDataset = await concurrentExecutor(
          datasets,
          async (dataset) => {
            const dsLocation = dataset.location?.toLowerCase();
            if (!dsLocation) {
              return null;
            }
            // Bounded, single page: we only need to know the dataset is non-empty and to
            // surface a small sample of tables, never the full (potentially huge) list.
            const [tables] = await dataset.getTables({
              maxResults: MAX_TABLES_PER_DATASET,
              autoPaginate: false,
            });
            return {
              location: dsLocation,
              tables: tables.map((table) => `${dataset.id}.${table.id}`),
            };
          },
          { concurrency: DATASET_CONCURRENCY }
        );

        const locations: Record<string, Set<string>> = {};
        for (const entry of perDataset) {
          if (!entry) {
            continue;
          }
          const set = (locations[entry.location] ??= new Set());
          for (const table of entry.tables) {
            if (set.size >= MAX_TABLES_PER_LOCATION) {
              break;
            }
            set.add(table);
          }
        }
        return locations;
      };

      const result = await Promise.race([
        enumerate(),
        setTimeoutAsync(ENUMERATION_TIMEOUT_MS),
      ]);

      if (result === "timeout") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Failed to check BigQuery locations: timed out listing the " +
              "project's datasets and tables. The BigQuery project is very " +
              "large — please contact support so we can connect it manually.",
          },
        });
      }

      return ctx.json({
        locations: Object.fromEntries(
          Object.entries(result).map(([location, tables]) => [
            location,
            Array.from(tables).sort(),
          ])
        ),
      });
    } catch (err) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Failed to check BigQuery locations: ${normalizeError(err).message}`,
        },
      });
    }
  }
);

export default app;
