import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const ImportSkillsRequestBodySchema = t.type({
  repoUrl: t.string,
  names: t.array(t.string),
});

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  errors: { name: string; message: string }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ImportSkillsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "User is not a builder.",
          },
        });
      }

      const featureFlags = await getFeatureFlags(owner);
      if (!featureFlags.includes("sandbox_tools")) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message: "Skill import from GitHub is not supported.",
          },
        });
      }

      const bodyValidation = ImportSkillsRequestBodySchema.decode(req.body);
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

      const { repoUrl, names } = bodyValidation.right;

      const result = await importSkillsFromGitHub(auth, { repoUrl, names });
      if (result.isErr()) {
        const error = result.error;
        switch (error.type) {
          case "invalid_url":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          case "not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          case "auth_error":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          case "github_api_error":
            logger.error(
              { error, workspaceId: owner.sId },
              "Error detecting skills from GitHub repo during import"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          default:
            assertNever(error);
        }
      }

      return res.status(200).json({
        imported: result.value.imported.map((skill) => skill.toJSON(auth)),
        updated: result.value.updated.map((skill) => skill.toJSON(auth)),
        errors: result.value.errors,
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
