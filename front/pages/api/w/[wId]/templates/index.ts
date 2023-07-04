import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
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
  res: NextApiResponse<GetTemplatesResponseBody | PostTemplatesResponseBody | UpdateTemplatesResponseBody>
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

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  let body;
  let template;
  switch (req.method) {
    case "GET":
      const templates = await GensTemplate.findAll({
        where: {
          workspaceId: owner.id,
        },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        templates: templates.map((t) => {
          return {
            name: t.name,
            instructions: t.instructions
          };
        }),
      });
      return;

    case "POST":
      body = req.body;

      template = await GensTemplate.create({
        name: body.name,
        instructions: body.instructions,
        workspaceId: owner.id,
      });

      res.status(201).json({
        template: {
          name: template.name,
          instructions: template.instructions,
        },
      });
      return;
    case "PUT":
      body = req.body;

      template = await GensTemplate.findOne({
        where: {
          id: body.id,
          workspaceId: owner.id,
        },
      });

      if (!template) {
        res.status(404).end();
        return;
      }

      await template.update({
        name: body.name,
        instructions: body.instructions,
      });

      res.status(200).json({
        template: {
          name: template.name,
          instructions: template.instructions,
        },
      });
      return;
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
