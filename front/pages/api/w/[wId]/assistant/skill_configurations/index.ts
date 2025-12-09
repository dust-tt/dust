import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isGlobalAgentId, isString } from "@app/types";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

export type PostSkillConfigurationResponseBody = {
  skillConfiguration: Omit<
    SkillConfigurationType,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "authorId"
  >;
};

export interface GetAgentSkillsResponseBody {
  skills: SkillConfigurationType[];
}

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
    | WithAPIErrorResponse<PostSkillConfigurationResponseBody>
    | WithAPIErrorResponse<GetAgentSkillsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("skills")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { aId } = req.query;
      if (!isString(aId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid agent configuration ID.",
          },
        });
      }

      const agent = await getAgentConfiguration(auth, {
        agentId: aId,
        variant: "light",
      });
      if (!agent) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent configuration was not found.",
          },
        });
      }

      if (isGlobalAgentId(agent.sId)) {
        // TODO(skills 2025-12-09): Implement fetching skills for global agents.
        return res.status(200).json({
          skills: [],
        });
      }

      const skills =
        await SkillConfigurationResource.fetchByAgentConfigurationId(
          auth,
          agent.id
        );

      return res.status(200).json({
        skills: skills.map((s) => s.toJSON()),
      });
    }
    case "POST": {
      const user = auth.getNonNullableUser();

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
          sId: makeSId("skill", {
            id: skillConfiguration.id,
            workspaceId: skillConfiguration.workspaceId,
          }),
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
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
