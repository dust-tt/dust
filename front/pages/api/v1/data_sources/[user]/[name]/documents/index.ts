import { User, DataSource, Key } from "@app/lib/models";
import { Op } from "sequelize";
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
    return res.status(err.status_code).json(err.error);
  }
  const authUser = authRes.value();

  if (!dataSourceOwner) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  const readOnly = authUser.id !== dataSourceOwner.id;

  let dataSource = await DataSource.findOne({
    where: readOnly
      ? {
          userId: dataSourceOwner.id,
          name: req.query.name,
          visibility: {
            [Op.or]: ["public"],
          },
        }
      : {
          userId: dataSourceOwner.id,
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

export default withLogging(handler);
