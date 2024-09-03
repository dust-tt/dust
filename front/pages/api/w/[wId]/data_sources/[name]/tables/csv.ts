import { assertNever, SlugifiedString } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { rowsFromCsv, upsertTableFromCsv } from "@app/lib/api/tables";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { enqueueUpsertTable } from "@app/lib/upsert_queue";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

export const UpsertTableFromCsvSchema = t.intersection([
  t.type({
    name: SlugifiedString,
    description: t.string,
    timestamp: t.union([t.number, t.undefined, t.null]),
    tags: t.union([t.array(t.string), t.undefined, t.null]),
    parents: t.union([t.array(t.string), t.undefined, t.null]),
    truncate: t.boolean,
    async: t.union([t.boolean, t.undefined]),
  }),
  // csv is optional when editing an existing table.
  t.union([
    t.type({ csv: t.string, tableId: t.undefined }),
    t.type({
      csv: t.union([t.string, t.undefined]),
      tableId: t.string,
    }),
  ]),
]);

type UpsertTableFromCsvRequestBodyRaw = t.TypeOf<
  typeof UpsertTableFromCsvSchema
>;

export type UpsertTableFromCsvRequestBody = Omit<
  UpsertTableFromCsvRequestBodyRaw,
  "name"
> & {
  name: string; // Manually map the 'name' field from SlugifiedString to string.
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
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

export default withSessionAuthenticationForWorkspace(handler);

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

  const bodyValidation = UpsertTableFromCsvSchema.decode(req.body);
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

  const { name, description, csv, truncate, async } = bodyValidation.right;
  if (!csv && truncate) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Cannot truncate a table without providing a CSV.",
      },
      status_code: 400,
    });
  }

  const tableId = bodyValidation.right.tableId ?? generateLegacyModelSId();
  const tableParents: string[] = bodyValidation.right.parents ?? [];

  if (!tableParents.includes(tableId)) {
    tableParents.push(tableId);
  }

  if (async) {
    // Ensure the CSV is valid before enqueuing the upsert.
    const csvRowsRes = csv ? await rowsFromCsv(auth, csv) : null;
    if (csvRowsRes?.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: `Failed to parse CSV: ${csvRowsRes.error.message}`,
        },
        status_code: 400,
      });
    }

    const enqueueRes = await enqueueUpsertTable({
      upsertTable: {
        workspaceId: owner.sId,
        projectId: dataSource.dustAPIProjectId,
        dataSourceName,
        tableId,
        tableName: name,
        tableDescription: description,
        tableTimestamp: bodyValidation.right.timestamp ?? null,
        tableTags: bodyValidation.right.tags ?? [],
        tableParents,
        csv: csv ?? null,
        truncate,
      },
    });
    if (enqueueRes.isErr()) {
      return apiError(
        req,
        res,
        {
          status_code: 500,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error enqueueing the the document for asynchronous upsert.",
          },
        },
        enqueueRes.error
      );
    }
    return res.status(200).json({
      table: {
        table_id: tableId,
      },
    });
  }

  const tableRes = await upsertTableFromCsv({
    auth,
    dataSource,
    tableId,
    tableName: name,
    tableDescription: description,
    tableTimestamp: bodyValidation.right.timestamp ?? null,
    tableTags: bodyValidation.right.tags || [],
    tableParents,
    csv: csv ?? null,
    truncate,
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
