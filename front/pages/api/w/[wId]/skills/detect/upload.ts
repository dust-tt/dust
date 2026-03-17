/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/zip/file_detection";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { DetectSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/detect";
import type { WithAPIErrorResponse } from "@app/types/error";
import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DetectSkillsResponseBody>>,
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
            message: "Skill import is not supported.",
          },
        });
      }

      const form = formidable({
        multiples: true,
        maxFileSize: MAX_ZIP_SIZE_BYTES,
      });
      const [, files] = await form.parse(req);
      const uploadedFiles = files.files;

      if (!uploadedFiles || uploadedFiles.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "No files uploaded.",
          },
        });
      }

      const result = detectSkillsFromUploadedFiles(uploadedFiles);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }

      const detectedSkills = result.value;

      if (detectedSkills.length === 0) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message:
              "No skills found. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).",
          },
        });
      }

      const skillSummaries = await concurrentExecutor(
        detectedSkills,
        async (skill): Promise<DetectedSkillSummary> => {
          const existing = await SkillResource.fetchActiveByName(
            auth,
            skill.name
          );

          if (!existing) {
            return {
              name: skill.name,
              status: "ready",
              existingSkillId: null,
            };
          }

          if (existing.source === "local_file") {
            return {
              name: skill.name,
              status: "skill_already_exists",
              existingSkillId: existing.sId,
            };
          }

          return {
            name: skill.name,
            status: "name_conflict",
            existingSkillId: existing.sId,
          };
        },
        { concurrency: 8 }
      );

      return res.status(200).json({ skills: skillSummaries });
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
