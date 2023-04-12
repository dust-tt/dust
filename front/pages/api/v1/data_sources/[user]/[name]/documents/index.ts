import { auth_api_user } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { APIError } from "@app/lib/error";
import { DataSource, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentsResponseBody | APIError>
): Promise<void> {
  let [authRes, dataSourceUser] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error;
    return res.status(err.status_code).json(err.api_error);
  }
  const auth = authRes.value;

  if (!dataSourceUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  let dataSource = await DataSource.findOne({
    where: {
      userId: dataSourceUser.id,
      name: req.query.name,
    },
  });

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
      if (!auth.canReadDataSource(dataSource)) {
        res.status(404).json({
          error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
        return;
      }

      let limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        limit,
        offset
      );
      if (documents.isErr()) {
        return res.status(documents.error.code).json({
          error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source documents.",
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
