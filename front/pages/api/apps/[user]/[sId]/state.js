import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App } from "../../../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  if (!session) {
    res.status(401).end();
    return;
  }

  let [user] = await Promise.all([
    User.findOne({
      where: {
        githubId: session.provider.id.toString(),
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
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
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
