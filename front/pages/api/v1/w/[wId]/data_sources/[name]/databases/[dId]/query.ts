import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import {
  CoreAPI,
  CoreAPIDatabaseRow,
  CoreAPIDatabaseSchema,
} from "@app/lib/core_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const GetDatabaseSchemaReqBodySchema = t.type({
  query: t.string,
});

type QueryDatabaseSchemaResponseBody = {
  schema: CoreAPIDatabaseSchema;
  rows: CoreAPIDatabaseRow[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<QueryDatabaseSchemaResponseBody>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  if (!isDevelopmentOrDustWorkspace(owner)) {
    res.status(404).end();
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const databaseId = req.query.dId;
  if (!databaseId || typeof databaseId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request query: id is required.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = GetDatabaseSchemaReqBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { query } = bodyValidation.right;

      const queryRes = await CoreAPI.queryDatabase({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId,
        query,
      });
      if (queryRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseId,
            error: queryRes.error,
          },
          "Failed to query database."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to query database.",
          },
        });
      }

      const { schema, rows } = queryRes.value;

      return res.status(200).json({ schema, rows });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
