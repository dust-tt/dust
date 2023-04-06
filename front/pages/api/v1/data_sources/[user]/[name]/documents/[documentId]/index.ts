import { User, DataSource, Key, Provider } from "@app/lib/models";
import { Op } from "sequelize";
import { credentialsFromProviders } from "@app/lib/providers";
import { NextApiRequest, NextApiResponse } from "next";
import { auth_api_user } from "@app/lib/api/auth";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let [authRes, dataSourceOwner] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error();
    return res.status(err.status_code).json(err.api_error);
  }
  const auth = authRes.value();

  if (!dataSourceOwner) {
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
      userId: dataSourceOwner.id,
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

      const docRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(req.query.documentId as string)}`,
        {
          method: "GET",
        }
      );

      if (!docRes.ok) {
        const error = await docRes.json();
        if (docRes.status === 404) {
          res.status(404).json({
            error: {
              type: "data_source_document_not_found",
              message:
                "The data source document you're trying to retrieve was not found.",
            },
          });
        } else {
          res.status(400).json({
            error: {
              type: "data_source_error",
              message:
                "There was an error retrieving the data source document.",
              data_source_error: error.error,
            },
          });
        }
        break;
      }

      const document = await docRes.json();

      res.status(200).json({
        document: document.response.document,
      });
      break;

    case "POST":
      if (!auth.canEditDataSource(dataSource)) {
        res.status(401).json({
          error: {
            type: "data_source_user_mismatch_error",
            message: "Only the data source you own can be managed by API.",
          },
        });
        return;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);

      if (!req.body || !(typeof req.body.text == "string")) {
        res.status(400).json({
          error: {
            type: "invalid_request_error",
            message: "Invalid request body, `text` (string) is required.",
          },
        });
        break;
      }

      let timestamp = null;
      if (req.body.timestamp) {
        if (typeof req.body.timestamp !== "number") {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `timestamp` if provided must be a number.",
            },
          });
          break;
        }
        timestamp = req.body.timestamp;
      }

      let tags = [];
      if (req.body.tags) {
        if (!Array.isArray(req.body.tags)) {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `tags` if provided must be an array of strings.",
            },
          });
          break;
        }
        tags = req.body.tags;
      }

      // Enforce FreePlan limit: 32 documents per DataSource.
      if (auth.user().username !== "spolu") {
        const documentsRes = await fetch(
          `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=1&offset=0`,
          {
            method: "GET",
          }
        );
        if (!documentsRes.ok) {
          const error = await documentsRes.json();
          res.status(400).json({
            error: {
              type: "data_source_error",
              message: "There was an error retrieving the data source.",
              data_source_error: error.error,
            },
          });
          break;
        }
        const documents = await documentsRes.json();
        if (documents.response.total >= 32) {
          res.status(401).json({
            error: {
              type: "data_source_quota_error",
              message:
                "Data sources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit.",
            },
          });
          break;
        }
      }

      // Enforce FreePlan limit: 1MB per document.
      if (req.body.text.length > 1024 * 1024) {
        res.status(401).json({
          error: {
            type: "data_source_quota_error",
            message:
              "Data sources document upload size is limited to 1MB on our free plan. Contact team@dust.tt if you want to increase it.",
          },
        });
        break;
      }

      let credentials = credentialsFromProviders(providers);

      // Create document with the Dust internal API.
      const upsertRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: req.query.documentId,
            timestamp,
            tags,
            text: req.body.text,
            credentials,
          }),
        }
      );

      if (!upsertRes.ok) {
        const error = await upsertRes.json();
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: error.error,
          },
        });
        break;
      }

      const data = await upsertRes.json();

      res.status(200).json({
        document: data.response.document,
        data_source: data.response.data_source,
      });
      break;

    case "DELETE":
      if (!auth.canEditDataSource(dataSource)) {
        res.status(401).json({
          error: {
            type: "data_source_user_mismatch_error",
            message: "Only the data source you own can be managed by API.",
          },
        });
        return;
      }

      const delRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(req.query.documentId as string)}`,
        {
          method: "DELETE",
        }
      );

      if (!delRes.ok) {
        const error = await delRes.json();
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: error.error,
          },
        });
        break;
      }

      res.status(200).json({
        document: {
          document_id: req.query.documentId,
        },
      });
      break;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE are expected.",
        },
      });
      break;
  }
}

export default withLogging(handler);
