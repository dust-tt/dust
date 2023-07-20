import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { deleteTemplate, getTemplate, updateTemplate } from "@app/lib/api/gens";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { parse_payload } from "@app/lib/http_utils";
import { GensTemplate } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { GensTemplateType, GensTemplateVisibilityType } from "@app/types/gens";

export type PostTemplatesResponseBody = {
  template: GensTemplateType;
};

export type GensPostTemplateQuery = {
  name: string;
  instructions2: string;
  color: string;
  visibility: GensTemplateVisibilityType;
  sId: string;
};

const gens_template_scheme: JSONSchemaType<GensPostTemplateQuery> = {
  type: "object",
  properties: {
    name: { type: "string" },
    instructions2: { type: "string" },
    visibility: { type: "string", enum: ["workspace", "user"] },
    color: { type: "string" },
    sId: { type: "string" },
  },
  required: ["name", "instructions2", "visibility", "color"],
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostTemplatesResponseBody>
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

  let template, result;
  switch (req.method) {
    case "POST":
      const pRes = parse_payload(gens_template_scheme, req.body);
      if (pRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The payload template sent was invalid.",
          },
        });
      }

      if (pRes.value.visibility === "workspace" && !isBuilder) {
        apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only builders of the current workspace can create templates with 'workspace' visibility.",
          },
        });
      }

      template = await getTemplate(auth, user, req.query.tId as string);
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

        result = await updateTemplate(auth, pRes.value);
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
        result = await GensTemplate.create({
          name: pRes.value.name,
          instructions2: pRes.value.instructions2,
          color: pRes.value.color,
          visibility: pRes.value.visibility as "workspace" | "user",
          workspaceId: owner.id,
          sId: req.query.tId as string,
          userId: user.id,
        });
      }
      res.status(201).json({
        template: pRes.value,
      });
      return;

    case "DELETE":
      result = await deleteTemplate(owner, req.query.tId as string);
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
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "invalid_request_error",
          message: "This endpoint only supports POST/DELETE",
        },
      });
  }
}

export default withLogging(handler);
