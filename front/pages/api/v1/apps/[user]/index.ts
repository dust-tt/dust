import { User, App } from "@app/lib/models";
import { Op } from "sequelize";
import { auth_api_user } from "@app/lib/api/auth";
import { NextApiRequest, NextApiResponse } from "next";
import withLogging from "@app/logger/withlogging";
import { Role } from "@app/lib/auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let [authRes, appOwner] = await Promise.all([
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

  if (!appOwner) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  let role = await auth.roleFor(appOwner);

  let apps = await App.findAll({
    where:
      role === Role.ReadOnly
        ? {
            userId: appOwner.id,
            visibility: {
              [Op.or]: ["public"],
            },
          }
        : {
            userId: appOwner.id,
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

export default withLogging(handler);
