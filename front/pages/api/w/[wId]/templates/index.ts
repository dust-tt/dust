import { NextApiRequest, NextApiResponse } from "next";

import {
  deleteTemplate,
  getGensTemplates,
  getTemplate,
  updateTemplate,
} from "@app/lib/api/gens";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { GensTemplate } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";
import { GensTemplateType } from "@app/types/gens";

export type GetTemplatesResponseBody = {
  templates: GensTemplateType[];
};

export type PostTemplatesResponseBody = {
  template: GensTemplateType;
};
export type UpdateTemplatesResponseBody = {
  template: GensTemplateType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetTemplatesResponseBody | PostTemplatesResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = await getUserFromSession(session);
  const isBuilder = auth.isBuilder();
  if (!owner) {
    res.status(404).end();
    return;
  }

  if (!user) {
    res.status(403).end();
    return;
  }

  const body = req.body;
  let template, result;
  switch (req.method) {
    case "GET":
      const temp_data = await getGensTemplates(owner, user);
      res.status(200).json({
        templates: temp_data,
      });
      return;

    case "POST":
      if (body.visibility === "workspace" && !isBuilder) {
        res.status(403).end();
        return;
      }

      const temp_attrs = {
        name: body.name,
        instructions: body.instructions,
        workspaceId: owner.id,
        userId: user.id,
        color: body.color,
        sId: body.sId || new_id(),
        visibility: body.visibility,
      };
      // check if template exists
      template = await getTemplate(owner, user, temp_attrs.sId);
      if (template) {
        result = await updateTemplate(temp_attrs, owner, user, isBuilder);
        if (!result) {
          res.status(500).end();
          return;
        }
      } else {
        template = await GensTemplate.create(temp_attrs);
      }
      if (!template) {
        res.status(500).end();
      }
      res.status(201).json({
        template: temp_attrs,
      });
      return;
    case "DELETE":
      result = await deleteTemplate(owner, user, body.sId, isBuilder);
      if (!result) {
        res.status(500).end();
        return;
      }
      res.status(200).end();
      return;
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
