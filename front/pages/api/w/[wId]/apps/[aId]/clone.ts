import { NextApiRequest, NextApiResponse } from "next";

import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { App, Clone, Dataset } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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

  const app = await getApp(auth, req.query.aId as string);

  if (!app) {
    res.status(404).end();
    return;
  }

  const datasets = await getDatasets(auth, app);

  switch (req.method) {
    case "POST":
      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted"].includes(req.body.visibility) ||
        !(typeof req.body.wId == "string")
      ) {
        res.status(400).end();
        return;
      }

      const targetAuth = await Authenticator.fromSession(
        session,
        req.body.wId as string
      );

      if (!targetAuth.isBuilder()) {
        res.status(403).end();
        return;
      }

      const targetOwner = targetAuth.workspace();
      if (!targetOwner) {
        res.status(401).end();
        return;
      }

      const project = await DustAPI.cloneProject(app.dustAPIProjectId);
      if (project.isErr()) {
        res.status(500).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let [cloned] = await Promise.all([
        App.create({
          uId,
          sId: uId.slice(0, 10),
          name: req.body.name,
          description,
          visibility: req.body.visibility,
          dustAPIProjectId: project.value.project.project_id.toString(),
          savedSpecification: app.savedSpecification,
          workspaceId: targetOwner.id,
        }),
      ]);

      await Promise.all(
        datasets.map((d) => {
          return Dataset.create({
            name: d.name,
            description: d.description,
            appId: cloned.id,
            workspaceId: targetOwner.id,
          });
        })
      );

      await Clone.create({
        fromId: app.id,
        toId: cloned.id,
      });

      res.redirect(`/w/${targetOwner.sId}/a/${cloned.sId}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
