import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App } from "../../../../../lib/models";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }

  let [user] = await Promise.all([
    User.findOne({
      where: {
        githubId: session.github.id,
      },
    }),
  ]);
  if (!user) {
    res.status(401).end();
    return;
  }

  let [app] = await Promise.all([
    App.findOne({
      where: {
        userId: user.id,
        sId: req.query.sId,
      },
    }),
  ]);
  if (!app) {
    res.status(400).end();
    return;
  }

  switch (req.method) {
    case "GET":
      if (!app.savedRun || app.savedRun.length == 0) {
        res.status(200).json({ run: null });
      }

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${app.savedRun}`,
        {
          method: "GET",
        }
      );

      if (!runRes.ok) {
        res.status(500).end();
        break;
      }

      const run = await runRes.json();

      res.status(200).json({ run: run.response.run });
      break;

    default:
      res.status(405).end();
      break;
  }
}
