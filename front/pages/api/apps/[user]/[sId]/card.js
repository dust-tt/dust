import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { User, App } from "@app/lib/models";
import { Op } from "sequelize";
import withLogging from "@app/logger/withlogging";


const { THUM_IO_KEY } = process.env;

async function handler(req, res) {
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

  switch (req.method) {
    case "GET":
      let app = await App.findOne({
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
        attributes: [
          "id",
          "uId",
          "sId",
          "name",
          "description",
          "visibility",
          "savedSpecification",
          "savedConfig",
          "savedRun",
          "updatedAt",
        ],
      });

      if (!app) {
        res.status(404).end();
        return;
      }

      res.redirect(
        `https://image.thum.io/get/auth/${THUM_IO_KEY}/png/wait/3/noanimate/viewportWidth/600/width/600/crop/600/https://dust.tt/${req.query.user}/a/${req.query.sId}`
      );
      break;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);