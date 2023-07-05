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
import { apiError,withLogging } from "@app/logger/withlogging";
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
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
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
        apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only builders of the current workspace can create templates with 'workspace' visibility.",
          },
        });
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

      template = await getTemplate(owner, user, temp_attrs.sId);
      if (template) {
        if (template.userId !== user.id && !isBuilder) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only builders of the current workspace can update templates that they did not create.",
            },
          });
        }

        result = await updateTemplate(temp_attrs, owner, user, isBuilder);
        if (!result) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "template_not_found",
              message: "Could not find the template you're trying to update.",
            },
          });
        }
      } else {
        template = await GensTemplate.create(temp_attrs);
      }
      res.status(201).json({
        template: temp_attrs,
      });
      return;

    case "DELETE":
      result = await deleteTemplate(owner, user, body.sId, isBuilder);
      if (!result) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Could not find the template you're trying to update.",
          },
        });
      }
      res.status(200).end();
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
