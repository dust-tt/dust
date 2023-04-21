import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import { Authenticator, getSession } from "@app/lib/auth";
import { App } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { AppType } from "@app/types/app";

export type PostStateResponseBody = {
  app: AppType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostStateResponseBody>
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
        !(typeof req.body.specification == "string") ||
        !(typeof req.body.config == "string")
      ) {
        res.status(400).end();
        break;
      }

      const updateParams: {
        savedSpecification: string;
        savedConfig: string;
        savedRun?: string;
      } = {
        savedSpecification: req.body.specification,
        savedConfig: req.body.config,
      };

      if (req.body.run) {
        if (typeof req.body.run != "string") {
          res.status(400).end();
          break;
        }

        updateParams.savedRun = req.body.run;
      }

      await app.update(updateParams);

      res.status(200).json({
        app: {
          id: app.id,
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
      break;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
