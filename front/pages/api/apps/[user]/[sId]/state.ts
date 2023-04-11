import { auth_user } from "@app/lib/auth";
import { App, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";

export type PostStateResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostStateResponseBody>
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
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

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
    case "POST":
      if (!auth.canEditApp(app)) {
        res.status(401).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.specification == "string") ||
        !(typeof req.body.config == "string")
      ) {
        res.status(400).end();
        break;
      }

      await app.update({
        savedSpecification: req.body.specification,
        savedConfig: req.body.config,
      });

      res.status(200).json({ app });
      break;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
