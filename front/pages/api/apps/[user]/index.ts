import { auth_user, Role } from "@app/lib/auth";
import { DustAPI, isErrorResponse } from "@app/lib/dust_api";
import { App, User } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import withLogging from "@app/logger/withlogging";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

export type GetAppsResponseBody = {
  apps: Array<AppType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAppsResponseBody>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error().status_code).end();
    return;
  }
  let auth = authRes.value();

  if (!appUser) {
    res.status(404).end();
    return;
  }

  let role = await auth.roleFor(appUser);

  switch (req.method) {
    case "GET":
      let apps = await App.findAll({
        where:
          role === Role.ReadOnly
            ? {
                userId: appUser.id,
                // Do not include 'unlisted' here.
                visibility: "public",
              }
            : {
                userId: appUser.id,
                visibility: {
                  [Op.or]: ["public", "private", "unlisted"],
                },
              },
        order: [["updatedAt", "DESC"]],
      });

      res.status(200).json({ apps });
      return;

    case "POST":
      if (role !== Role.Owner) {
        res.status(401).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        return;
      }

      const p = await DustAPI.createProject();

      if (isErrorResponse(p)) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let app = await App.create({
        uId,
        sId: uId.slice(0, 10),
        name: req.body.name,
        description,
        visibility: req.body.visibility,
        userId: appUser.id,
        dustAPIProjectId: p.response.project.project_id.toString(),
      });

      res.redirect(`/${appUser.username}/a/${app.sId}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
