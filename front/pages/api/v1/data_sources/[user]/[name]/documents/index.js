import { User, DataSource, Key } from "@app/lib/models";
import { Op } from "sequelize";

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
  if (!parse || !parse[1]) {
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
      let limit = req.query.limit ? parseInt(req.query.limit) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset) : 0;

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
        break;
      }
      const documents = await docsRes.json();

      res.status(200).json({
        documents: documents.response.documents,
        total: documents.response.total,
      });
      break;
    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      break;
  }
}
