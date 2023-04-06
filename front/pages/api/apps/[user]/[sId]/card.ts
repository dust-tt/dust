import { auth_user } from "@app/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";
import { User, App } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";

const { THUM_IO_KEY } = process.env;

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

      res.redirect(
        `https://image.thum.io/get/auth/${THUM_IO_KEY}/png/wait/3/noanimate/viewportWidth/600/width/600/crop/600/https://dust.tt/${req.query.user}/a/${req.query.sId}`
      );
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
