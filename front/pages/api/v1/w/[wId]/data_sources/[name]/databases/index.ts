import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI, CoreAPIDatabase } from "@app/lib/core_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const CreateDatabaseReqBodySchema = t.type({
  name: t.string,
});
type CreateDatabaseResponseBody = {
  database: CoreAPIDatabase;
};

const ListDatabasesReqQuerySchema = t.type({
  offset: t.number,
  limit: t.number,
});
type ListDatabasesResponseBody = {
  databases: CoreAPIDatabase[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateDatabaseResponseBody | ListDatabasesResponseBody>
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

  switch (req.method) {
    case "POST":
      const bodyValidation = CreateDatabaseReqBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const { name } = bodyValidation.right;
      const id = generateModelSId();

      const createRes = await CoreAPI.createDatabase({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        databaseId: id,
        name,
      });
      if (createRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            databaseName: name,
            databaseId: id,
            error: createRes.error,
          },
          "Failed to create database."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create database.",
          },
        });
      }

      const { database } = createRes.value;

      return res.status(200).json({ database });

    case "GET":
      const queryValidation = ListDatabasesReqQuerySchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request query: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const { offset, limit } = queryValidation.right;

      const getRes = await CoreAPI.getDatabases({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        offset,
        limit,
      });

      if (getRes.isErr()) {
        logger.error(
          {
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            error: getRes.error,
          },
          "Failed to list databases."
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to list databases.",
          },
        });
      }

      const { databases } = getRes.value;

      return res.status(200).json({ databases });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
