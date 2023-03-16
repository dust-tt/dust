import { User, DataSource, Key, Provider } from "../../../../../../../../lib/models";
import { Op } from "sequelize";
import { credentialsFromProviders } from "../../../../../../../../lib/providers";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  if (!req.headers.authorization) {
    res.status(401).json({
      error: {
        type: "missing_authorization_header_error",
        message: "Missing Authorization header",
      },
    });
    return;
  }

  let parse = req.headers.authorization.match(/Bearer (sk-[a-zA-Z0-9]+)/);
  if (!parse) {
    res.status(401).json({
      error: {
        type: "malformed_authorization_header_error",
        message: "Malformed Authorization header",
      },
    });
    return;
  }
  let secret = parse[1];

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: secret,
      },
    }),
  ]);

  if (!key || key.status !== "active") {
    res.status(401).json({
      error: {
        type: "invalid_api_key_error",
        message: "The API key provided is invalid or disabled.",
      },
    });
    return;
  }

  let [reqUser, appUser] = await Promise.all([
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
    User.findOne({
      where: {
        id: key.userId,
      },
    }),
  ]);

  if (!reqUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  if (!appUser) {
    res.status(500).json({
      error: {
        type: "internal_server_error",
        message: "The user associaed with the api key was not found.",
      },
    });
    return;
  }

  const readOnly = appUser.id !== reqUser.id;

  let dataSource = await DataSource.findOne({
    where: readOnly
      ? {
          userId: reqUser.id,
          name: req.query.name,
          visibility: {
            [Op.or]: ["public"],
          },
        }
      : {
          userId: reqUser.id,
          name: req.query.name,
        },
    attributes: [
      "id",
      "name",
      "description",
      "visibility",
      "config",
      "dustAPIProjectId",
      "updatedAt",
    ],
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
      const docRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents/${req.query.documentId}`,
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
        text: document.response.text,
      });
      break;

    case "POST":
      if (readOnly) {
        res.status(401).json({
          error: {
            type: "data_source_user_mismatch_error",
            message: "Only the data source you own can be managed by API.",
          },
        });
        break;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: reqUser.id,
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

      // Enforce FreePlan limit: 32 documents per DataSource.
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
            tags: [],
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
      if (readOnly) {
        res.status(401).json({
          error: {
            type: "data_source_user_mismatch_error",
            message: "Only the data source you own can be managed by API.",
          },
        });
        break;
      }

      const delRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents/${req.query.documentId}`,
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
