import type { WithAPIErrorReponse, WorkspaceType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

const WorkspaceNameUpdateBodySchema = t.type({
  name: t.string,
});
const WorkspaceAllowedDomainUpdateBodySchema = t.type({
  domain: t.string,
  domainAutoJoinEnabled: t.boolean,
});
const PostWorkspaceRequestBodySchema = t.union([
  WorkspaceNameUpdateBodySchema,
  WorkspaceAllowedDomainUpdateBodySchema,
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostWorkspaceResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can modify it.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostWorkspaceRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const { right: body } = bodyValidation;

      const w = await Workspace.findOne({
        where: { id: owner.id },
      });
      if (!w) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace you're trying to modify was not found.",
          },
        });
      }

      if ("name" in body) {
        await w.update({
          name: body.name,
        });
        owner.name = body.name;
      } else {
        const { domain, domainAutoJoinEnabled } = body;
        const [affectedCount] = await WorkspaceHasDomain.update(
          {
            domainAutoJoinEnabled,
          },
          {
            where: {
              workspaceId: w.id,
              domain,
            },
          }
        );
        if (affectedCount === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The workspace does not have any verified domain.",
            },
          });
        }
      }

      res.status(200).json({ workspace: owner });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
