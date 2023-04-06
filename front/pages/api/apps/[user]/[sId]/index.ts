import { auth_user } from "@app/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";
import { User, App } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { AppType } from "@app/types/app";

export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostAppResponseBody>
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

  let [app] = await Promise.all([
    App.findOne({
      where: {
        userId: appUser.id,
        sId: req.query.sId,
      },
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      res.status(200).json({
        app: {
          uId: app.uId,
          sId: app.sId,
          name: app.name,
          description: app.description,
          visibility: app.visibility,
          savedSpecification: app.savedSpecification,
          savedConfig: app.savedConfig,
          savedRun: app.savedRun,
          dustAPIProjectId: app.dustAPIProjectId,
        },
      });
      return;

    case "POST":
      if (!auth.canEditApp(app)) {
        res.status(401).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted", "deleted"].includes(
          req.body.visibility
        )
      ) {
        res.status(400).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;

      await app.update({
        name: req.body.name,
        description,
        visibility: req.body.visibility,
      });

      res.redirect(`/${appUser.username}/a/${app.sId}`);
      break;

    case "DELETE":
      if (!auth.canEditApp(app)) {
        res.status(401).end();
        return;
      }

      await app.update({
        visibility: "deleted",
      });

      res.status(200).json({
        app: {
          uId: app.uId,
          sId: app.sId,
          name: app.name,
          description: app.description,
          visibility: app.visibility,
          savedSpecification: app.savedSpecification,
          savedConfig: app.savedConfig,
          savedRun: app.savedRun,
          dustAPIProjectId: app.dustAPIProjectId,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
