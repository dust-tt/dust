import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { App } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<void>
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
        !["public", "private", "unlisted"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        return;
      }

      const p = await DustAPI.createProject();

      if (p.isErr()) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let app = await App.create({
        uId,
        sId: uId.slice(0, 10),
        name: req.body.name,
        description,
        visibility: req.body.visibility,
        dustAPIProjectId: p.value.project.project_id.toString(),
        workspaceId: owner.id,
      });

      res.redirect(`/w/${owner.sId}/a/${app.sId}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
