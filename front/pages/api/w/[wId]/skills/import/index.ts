/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ImportSkillsRequestBodySchema = z.object({
  repoUrl: z.string(),
  names: z.array(z.string()),
});

export type ImportSkillsRequestBody = z.infer<
  typeof ImportSkillsRequestBodySchema
>;

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  skipped: { name: string; message: string }[];
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

      const bodyValidation = ImportSkillsRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { repoUrl, names } = bodyValidation.data;

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
          case "validation_error":
            return apiError(req, res, {
              status_code: 400,
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
        skipped: result.value.skipped,
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
