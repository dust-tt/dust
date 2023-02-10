import { User, App, Key } from "../../../../../lib/models";
import { Op } from "sequelize";

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

  let apps = await App.findAll({
    where: readOnly
      ? {
          userId: reqUser.id,
          visibility: {
            [Op.or]: ["public", "unlisted"],
          },
        }
      : {
          userId: reqUser.id,
        },
  });

  switch (req.method) {
    case "GET":
      res.status(200).json({
        apps: apps.map((a) => {
          return {
            sId: a.sId,
            name: a.name,
            description: a.description,
            visibility: a.visibility,
          };
        }),
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
