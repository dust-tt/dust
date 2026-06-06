/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { PostCheckBigQueryLocationsResponseBody } from "@app/lib/api/oauth";
import { PostCheckBigQueryRegionsRequestBodySchema } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorType, WithAPIErrorResponse } from "@app/types/error";
import { CheckBigQueryCredentialsSchema } from "@app/types/oauth/lib";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { BigQuery } from "@google-cloud/bigquery";
import type { NextApiRequest, NextApiResponse } from "next";

export type { PostCheckBigQueryLocationsResponseBody } from "@app/lib/api/oauth";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostCheckBigQueryLocationsResponseBody>
  >,
  auth: Authenticator
) {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: "Method not allowed",
      },
    });
  }

  // Check if the user is an admin
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can check BigQuery locations.",
      },
    });
  }

  const bodyValidation = PostCheckBigQueryRegionsRequestBodySchema.safeParse(
    req.body
  );

  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: `Invalid request body.`,
      },
    });
  }

  const credentialsValidation = CheckBigQueryCredentialsSchema.safeParse(
    bodyValidation.data.credentials
  );

  if (!credentialsValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: `Invalid credentials.`,
      },
    });
  }

  const credentials = credentialsValidation.data;

  try {
    const bigquery = new BigQuery({
      credentials,
      scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
    });

    // Get all datasets
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

    return res.status(200).json({
      locations: Object.fromEntries(
        Object.entries(locations).map(([location, tables]) => [
          location,
          Array.from(tables).sort(),
        ])
      ),
    });
  } catch (err) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: `Failed to check BigQuery locations: ${normalizeError(err).message}`,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
