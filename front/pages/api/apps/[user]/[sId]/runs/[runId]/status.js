import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../auth/[...nextauth]";
import { User, App } from "../../../../../../../lib/models";
import { Op } from "sequelize";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!user) {
    res.status(404).end();
    return;
  }

  const readOnly = !(session && session.github.id.toString() === user.githubId);

  let [app] = await Promise.all([
    App.findOne({
      where: readOnly
        ? {
            userId: user.id,
            sId: req.query.sId,
            visibility: {
              [Op.or]: ["public", "unlisted"],
            },
          }
        : {
            userId: user.id,
            sId: req.query.sId,
          },
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  let runId = req.query.runId;
  if (runId === "saved") {
    runId = app.savedRun;
  }

  switch (req.method) {
    case "GET":
      if (!runId || runId.length == 0) {
        res.status(200).json({ run: null });
        break;
      }

      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}/status`,
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
