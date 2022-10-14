import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User, Provider } from "../../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }

  let user = await User.findOne({
    where: {
      githubId: session.github.id.toString(),
    },
  });
  if (!user) {
    res.status(401).end();
    return;
  }
  let [provider] = await Promise.all([
    Provider.findOne({
      where: {
        userId: user.id,
        providerId: req.query.pId,
      },
    }),
  ]);

  switch (req.method) {
    case "POST":
      if (!req.body || !(typeof req.body.config == "string")) {
        res.status(400).end();
        break;
      }

      if (!provider) {
        provider = await Provider.create({
          providerId: req.query.pId,
          config: req.body.config,
          userId: user.id,
        });
      } else {
        await provider.update({
          config: req.body.config,
        });
      }

      res.status(200).json({ provider });
      break;

    case "DELETE":
      if (!provider) {
        res.status(404).end();
        break;
      }

      await Provider.destroy({
        where: {
          userId: user.id,
          providerId: req.query.pId,
        },
      });

      res.status(200).json({
        provider: {
          providerId: req.query.pId,
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
