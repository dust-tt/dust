import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { SkillConfiguration } from "@app/types/skill_configuration";

export type GetSkillConfigurationResponseBody = {
  skillConfiguration: SkillConfiguration;
};

export type PatchSkillConfigurationResponseBody = {
  skillConfiguration: Omit<
    SkillConfiguration,
    | "author"
    | "requestedSpaceIds"
    | "workspaceId"
    | "createdAt"
    | "updatedAt"
    | "authorId"
  >;
};

export type DeleteSkillConfigurationResponseBody = {
  success: boolean;
};

// Request body schema for PATCH
const PatchSkillConfigurationRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  scope: t.union([t.literal("private"), t.literal("workspace")]),
});

type PatchSkillConfigurationRequestBody = t.TypeOf<
  typeof PatchSkillConfigurationRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetSkillConfigurationResponseBody
      | PatchSkillConfigurationResponseBody
      | DeleteSkillConfigurationResponseBody
    >
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

  const sId = req.query.sId as string;
  const skillResource = await SkillConfigurationResource.fetchBySIdWithAuth(
    auth,
    sId
  );

  if (!skillResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const skillConfiguration = skillResource.toJSON();
      return res.status(200).json({ skillConfiguration });
    }

    case "PATCH": {
      const bodyValidation = PatchSkillConfigurationRequestBodySchema.decode(
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

      const body: PatchSkillConfigurationRequestBody = bodyValidation.right;

      // Check if user can edit
      const canEdit = await skillResource.canUserEdit(auth);
      if (!canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify this skill.",
          },
        });
      }

      // Check for existing active skill with the same name (excluding current skill)
      const existingSkill = await SkillConfigurationModel.findOne({
        where: {
          workspaceId: owner.id,
          name: body.name,
          status: "active",
        },
      });

      if (existingSkill && existingSkill.id !== skillResource.id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `A skill with the name "${body.name}" already exists.`,
          },
        });
      }

      const updateResult = await skillResource.updateSkill(auth, {
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        scope: body.scope,
      });

      if (updateResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error updating skill: ${updateResult.error.message}`,
          },
        });
      }

      const updatedSkill = updateResult.value;

      return res.status(200).json({
        skillConfiguration: {
          id: updatedSkill.id,
          sId: makeSId("skill", {
            id: updatedSkill.id,
            workspaceId: updatedSkill.workspaceId,
          }),
          name: updatedSkill.name,
          description: updatedSkill.description,
          instructions: updatedSkill.instructions,
          status: updatedSkill.status,
          scope: updatedSkill.scope,
          version: updatedSkill.version,
        },
      });
    }

    case "DELETE": {
      // Check if user can edit
      const canEdit = await skillResource.canUserEdit(auth);
      if (!canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete this skill.",
          },
        });
      }

      const deleteResult = await skillResource.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Error deleting skill: ${deleteResult.error.message}`,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
