import { assertNever, slugify } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { upsertTableFromCsv } from "@app/lib/api/tables";
import { Authenticator, getSession } from "@app/lib/auth";
import { generateModelSId } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

export const CreateTableFromCsvSchema = t.intersection([
  t.type({
    name: t.string,
    description: t.string,
  }),
  // csv is optional when editing an existing table.
  t.union([
    t.type({ csv: t.string, tableId: t.undefined }),
    t.type({ csv: t.union([t.string, t.undefined]), tableId: t.string }),
  ]),
]);

export type UpsertTableFromCsvRequestBody = t.TypeOf<
  typeof CreateTableFromCsvSchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
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
      return handlePostTableCsvUpsertRequest(auth, req, res);
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);

export async function handlePostTableCsvUpsertRequest(
  auth: Authenticator,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (
    !owner.flags.includes("structured_data") &&
    !owner.flags.includes("auto_pre_ingest_all_databases")
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSourceName = req.query.name;

  if (!dataSourceName || typeof dataSourceName !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The data source name is missing.",
      },
    });
  }

  const dataSource = await getDataSource(auth, dataSourceName);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const bodyValidation = CreateTableFromCsvSchema.decode(req.body);
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

  const { name, description, csv } = bodyValidation.right;
  const tableId = bodyValidation.right.tableId ?? generateModelSId();
  const slugifyName = slugify(name);

  const tableRes = await upsertTableFromCsv({
    owner,
    projectId: dataSource.dustAPIProjectId,
    dataSourceName,
    tableName: slugifyName,
    tableDescription: description,
    tableId,
    csv: csv ?? null,
  });

  if (tableRes.isErr()) {
    if (tableRes.error.type === "internal_server_error") {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: tableRes.error.message,
        },
        status_code: 500,
      });
    }

    if (tableRes.error.type === "invalid_request_error") {
      if ("csvParsingError" in tableRes.error) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Failed to parse CSV: ${tableRes.error.csvParsingError.message}`,
          },
          status_code: 400,
        });
      } else if ("inputValidationError" in tableRes.error) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${tableRes.error.inputValidationError}`,
          },
          status_code: 400,
        });
      } else {
        assertNever(tableRes.error);
      }
    }

    if (tableRes.error.type === "not_found_error") {
      return apiError(req, res, {
        api_error: {
          type: tableRes.error.notFoundError.type,
          message: tableRes.error.notFoundError.message,
        },
        status_code: 404,
      });
    }

    assertNever(tableRes.error);
  }

  return res.status(200).json(tableRes.value);
}
