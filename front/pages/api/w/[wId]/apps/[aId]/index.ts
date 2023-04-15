import { Authenticator, getSession } from "@app/lib/auth";
import { App } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

export type PostAppResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostAppResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  let app = await App.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          sId: req.query.aId,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          sId: req.query.aId,
        },
  });

  if (!app) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      if (!auth.isBuilder()) {
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

      res.redirect(`/w/${owner.sId}/a/${app.sId}`);
      break;

    case "DELETE":
      if (!auth.isBuilder()) {
        res.status(401).end();
        return;
      }

      await app.update({
        visibility: "deleted",
      });

      res.status(200).json({
        app: {
          internalId: app.id,
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
