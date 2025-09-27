import { BigQuery } from "@google-cloud/bigquery";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorType, WithAPIErrorResponse } from "@app/types";
import {
  CheckBigQueryCredentialsSchema,
  normalizeError,
  removeNulls,
} from "@app/types";

const PostCheckBigQueryRegionsRequestBodySchema = t.type({
  credentials: CheckBigQueryCredentialsSchema,
});

export type PostCheckBigQueryLocationsResponseBody = {
  locations: Record<string, string[]>;
};

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

  const bodyValidation = PostCheckBigQueryRegionsRequestBodySchema.decode(
    req.body
  );

  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const credentialsValidation = CheckBigQueryCredentialsSchema.decode(
    bodyValidation.right.credentials
  );

  if (isLeft(credentialsValidation)) {
    const pathError = reporter.formatValidationErrors(
      credentialsValidation.left
    );
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error" as APIErrorType,
        message: `Invalid credentials: ${pathError}`,
      },
    });
  }

  const credentials = credentialsValidation.right;

  try {
    const bigquery = new BigQuery({
      credentials,
      scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
    });

    // Get all datasets
    const [datasets] = await bigquery.getDatasets();

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
          Array.from(tables),
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
