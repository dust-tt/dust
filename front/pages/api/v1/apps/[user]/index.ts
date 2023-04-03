import { User, App } from "@app/lib/models";
import { Op } from "sequelize";
import { auth_api_user } from "@app/lib/api/auth";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth_result = await auth_api_user(req);
  if (auth_result.isErr()) {
    const err = auth_result.error();
    return res.status(err.status_code).json(err.error);
  }
  const authUser = auth_result.value();

  let appOwner = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!appOwner) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }
  
  const readOnly = authUser.id !== appOwner.id;

  let apps = await App.findAll({
    where: readOnly
      ? {
          userId: appOwner.id,
          visibility: {
            [Op.or]: ["public", "unlisted"],
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
