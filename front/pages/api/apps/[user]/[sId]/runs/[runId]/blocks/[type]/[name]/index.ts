import { App, User } from "@app/lib/models";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { Run } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";
import { unstable_getServerSession } from "next-auth/next";
import { Op } from "sequelize";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

export type GetRunBlockResponseBody = {
  run: Run | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunBlockResponseBody>
) {
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

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

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
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}/blocks/${req.query.type}/${req.query.name}`,
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

export default withLogging(handler);