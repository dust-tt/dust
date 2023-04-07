import { User, App } from "@app/lib/models";
import { Op } from "sequelize";
import { auth_api_user } from "@app/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";
import withLogging from "@app/logger/withlogging";
import { Role } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { AppType } from "@app/types/app";

export type GetAppsResponseBody = {
  apps: AppType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAppsResponseBody | APIError>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
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

  if (!appUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  let role = await auth.roleFor(appUser);

  let apps = await App.findAll({
    where:
      role === Role.ReadOnly
        ? {
            userId: appUser.id,
            visibility: {
              [Op.or]: ["public"],
            },
          }
        : {
            userId: appUser.id,
          },
  });

  switch (req.method) {
    case "GET":
      res.status(200).json({
        apps: apps.map((a) => {
          return {
            uId: a.uId,
            sId: a.sId,
            name: a.name,
            description: a.description,
            visibility: a.visibility,
            dustAPIProjectId: a.dustAPIProjectId,
          };
        }),
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
