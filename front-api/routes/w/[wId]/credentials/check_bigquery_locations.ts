import { CheckBigQueryCredentialsSchema } from "@app/types/oauth/lib";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureRole } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { BigQuery } from "@google-cloud/bigquery";
import { z } from "zod";

const PostCheckBigQueryRegionsRequestBodySchema = z.object({
  credentials: CheckBigQueryCredentialsSchema,
});

export type PostCheckBigQueryLocationsResponseBody = {
  locations: Record<string, string[]>;
};

const app = workspaceApp();

app.use("*", ensureRole({ admin: true }));

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

      const [datasets] = await bigquery.getDatasets();

      // Strict location listing: only expose actual dataset locations and only associate
      // tables to their dataset's exact location (no regional/multi-region expansion).
      const locations: Record<string, Set<string>> = {};

      for (const dataset of datasets) {
        const dsLocation = dataset.location?.toLowerCase();
        if (!dsLocation) {
          continue;
        }
        const [tables] = await dataset.getTables();
        for (const table of tables) {
          locations[dsLocation] ??= new Set();
          locations[dsLocation].add(`${dataset.id}.${table.id}`);
        }
      }

      return ctx.json({
        locations: Object.fromEntries(
          Object.entries(locations).map(([location, tables]) => [
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
