import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { APIError } from "@app/lib/error";
import { withLogging } from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentsResponseBody | APIError>
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    const err = keyRes.error;
    return res.status(err.status_code).json(err.api_error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    res.status(404).json({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
    return;
  }

  switch (req.method) {
    case "GET":
      let limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        limit,
        offset
      );
      if (documents.isErr()) {
        return res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source documents.",
            data_source_error: documents.error,
          },
        });
      }

      res.status(200).json({
        documents: documents.value.documents,
        total: documents.value.total,
      });
      return;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
