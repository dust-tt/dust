import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SkillScope, SkillStatus } from "@app/lib/models/skill";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

// TODO(skills): add a resource (TBD on AgentConfigurationResource).
export type SkillConfigurationType = {
  id: number;
  name: string;
  description: string;
  instructions: string;
  status: SkillStatus;
  scope: SkillScope;
  version: number;
};

export type PostSkillConfigurationResponseBody = {
  skillConfiguration: SkillConfigurationType;
};

// Request body schema for POST
const PostSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  scope: t.union([t.literal("private"), t.literal("workspace")]),
});

type PostSkillConfigurationRequestBody = t.TypeOf<
  typeof PostSkillConfigurationRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostSkillConfigurationResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostSkillConfigurationRequestBodySchema.decode(
        req.body
      );

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

      const body: PostSkillConfigurationRequestBody = bodyValidation.right;

      // Check for existing active skill with the same name.
      // TODO(skills): consolidate this kind of db interaction within a resource.
      const existingSkill = await SkillConfigurationModel.findOne({
        where: {
          workspaceId: owner.id,
          name: body.name,
          status: "active",
        },
      });

      if (existingSkill) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${body.name}" already exists.`,
          },
        });
      }

      const skillConfiguration = await SkillConfigurationModel.create({
        workspaceId: owner.id,
        version: 0,
        status: "active",
        scope: body.scope,
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        authorId: user.id,
        // TODO(skills): add space restrictions.
        requestedSpaceIds: [],
      });

      await GroupResource.makeNewSkillEditorsGroup(auth, skillConfiguration);

      return res.status(200).json({
        skillConfiguration: {
          id: skillConfiguration.id,
          name: skillConfiguration.name,
          description: skillConfiguration.description,
          instructions: skillConfiguration.instructions,
          status: skillConfiguration.status,
          scope: skillConfiguration.scope,
          version: skillConfiguration.version,
        },
      });
    }

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

export default withSessionAuthenticationForWorkspace(handler);
