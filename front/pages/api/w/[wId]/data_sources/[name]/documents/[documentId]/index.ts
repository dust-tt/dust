import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { APIError } from "@app/lib/error";
import { Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { isValidUrl } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";

export type GetDocumentResponseBody = {
  document: DocumentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentResponseBody | APIError>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
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
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
          },
        }),
      ]);

      if (!req.body || !(typeof req.body.text == "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body, `text` (string) is required.",
          },
        });
      }

      let tags = [];
      if (req.body.tags) {
        if (!Array.isArray(req.body.tags)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `tags` if provided must be an array of strings.",
            },
          });
        }
        tags = req.body.tags;
      }

      let sourceUrl: string | null = null;
      if (req.body.sourceUrl) {
        if (typeof req.body.sourceUrl !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `sourceUrl` if provided must be a string.",
            },
          });
        }

        if (!isValidUrl(req.body.sourceUrl)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `sourceUrl` if provided must be a valid URL.",
            },
          });
        }
        sourceUrl = req.body.sourceUrl;
      }

      // Enforce plan limits.
      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        1,
        0
      );
      if (documents.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source.",
            data_source_error: documents.error,
          },
        });
      }

      // Enforce plan limits: DataSource documents count.
      if (
        documents.value.total >= owner.plan.limits.dataSources.documents.count
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_quota_error",
            message:
              "Data sources are limited to 32 documents on our free plan. \
               Contact team@dust.tt if you want to increase this limit.",
          },
        });
      }

      // Enforce plan limits: DataSource document size.
      if (
        req.body.text.length >
        1024 * owner.plan.limits.dataSources.documents.sizeMb
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_quota_error",
            message:
              "Data sources document upload size is limited to 1MB on our free plan. \
               Contact team@dust.tt if you want to increase it.",
          },
        });
      }

      let credentials = credentialsFromProviders(providers);

      // Create document with the Dust internal API.
      const data = await DustAPI.upsertDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          documentId: req.query.documentId as string,
          tags,
          sourceUrl,
          credentials,
          text: req.body.text,
        }
      );
      if (data.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: data.error,
          },
        });
      }

      res.status(201).json({
        document: data.value.document,
      });
      return;

    case "GET":
      const document = await DustAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (document.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source's document.",
            data_source_error: document.error,
          },
        });
      }

      res.status(200).json({
        document: document.value.document,
      });
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
      }

      const deleteRes = await DustAPI.deleteDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: deleteRes.error,
          },
        });
      }

      res.status(200).end();
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
