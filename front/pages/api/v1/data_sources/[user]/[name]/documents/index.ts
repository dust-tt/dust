import { auth_api_user } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { DataSource, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { NextApiRequest, NextApiResponse } from "next";

const { DUST_API } = process.env;

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

      const docsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
        {
          method: "GET",
        }
      );

      if (!docsRes.ok) {
        const error = await docsRes.json();
        res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source documents.",
            data_source_error: error.error,
          },
        });
        return;
      }
      const documents = await docsRes.json();

      res.status(200).json({
        documents: documents.response.documents,
        total: documents.response.total,
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
