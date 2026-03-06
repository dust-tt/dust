import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/github_detection/github_auth";
import {
  detectSkillsFromGitHubRepo,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/github_detection/detect_skills";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type DetectSkillsResponseBody = {
  skills: DetectedSkillSummary[];
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
            message: "Skill import from GitHub is not supported.",
          },
        });
      }

      const { repoUrl } = req.body;

      if (!isString(repoUrl)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "repoUrl is required and must be a string.",
          },
        });
      }

      const accessToken = await getWorkspaceLevelGitHubAccessToken(auth);
      const result = await detectSkillsFromGitHubRepo({
        repoUrl,
        accessToken,
      });

      if (result.isErr()) {
        logger.error(
          { error: result.error, workspaceId: owner.sId },
          "Error detecting skills from GitHub repo"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
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
              "No skills found in this repository. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).",
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

          return {
            name: skill.name,
            status: isSkillFromGitHubRepo(existing, { repoUrl })
              ? "skill_already_exists"
              : "name_conflict",
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
