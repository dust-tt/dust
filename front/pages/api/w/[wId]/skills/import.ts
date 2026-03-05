import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { detectSkillsFromGitHubRepo, isSkillFromGitHubRepo } from "@app/lib/api/skills/github_detection/detect_skills";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const IMPORT_CONCURRENCY = 4;

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

      const result = await detectSkillsFromGitHubRepo({ repoUrl });
      if (result.isErr()) {
        logger.error(
          { error: result.error, workspaceId: owner.sId },
          "Error detecting skills from GitHub repo during import"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      const requestedNames = new Set(names);
      const selectedSkills = result.value.filter(
        (skill) =>
          requestedNames.has(skill.name) &&
          skill.name &&
          skill.instructions.trim()
      );

      const user = auth.getNonNullableUser();
      const imported: SkillResource[] = [];
      const updated: SkillResource[] = [];
      const errors: { name: string; message: string }[] = [];

      await concurrentExecutor(
        selectedSkills,
        async (skill) => {
          const existing = await SkillResource.fetchActiveByName(
            auth,
            skill.name
          );

          if (existing) {
            if (!isSkillFromGitHubRepo(existing, { repoUrl })) {
              errors.push({
                name: skill.name,
                message: `A different skill named "${skill.name}" already exists.`,
              });
              return;
            }

            const attachedKnowledge =
              await existing.getAttachedKnowledge(auth);

            await existing.updateSkill(auth, {
              name: skill.name,
              agentFacingDescription: skill.description,
              userFacingDescription: skill.description,
              instructions: skill.instructions,
              icon: existing.icon,
              mcpServerViews: existing.mcpServerViews,
              attachedKnowledge,
              requestedSpaceIds: existing.requestedSpaceIds,
              source: "github",
              sourceMetadata: {
                repoUrl,
                filePath: skill.skillMdPath,
              },
            });

            updated.push(existing);
            return;
          }

          let icon: string | null = null;
          const iconResult = await getSkillIconSuggestion(auth, {
            name: skill.name,
            instructions: skill.instructions,
            agentFacingDescription: skill.description,
          });
          if (iconResult.isOk()) {
            icon = iconResult.value;
          } else {
            logger.warn(
              { error: iconResult.error, skillName: skill.name },
              "Failed to generate icon suggestion for imported skill"
            );
          }

          const skillResource = await SkillResource.makeNew(
            auth,
            {
              status: "active",
              name: skill.name,
              agentFacingDescription: skill.description,
              userFacingDescription: skill.description,
              instructions: skill.instructions,
              editedBy: user.id,
              requestedSpaceIds: [],
              extendedSkillId: null,
              icon,
              source: "github",
              sourceMetadata: {
                repoUrl,
                filePath: skill.skillMdPath,
              },
            },
            { mcpServerViews: [] }
          );

          imported.push(skillResource);
        },
        { concurrency: IMPORT_CONCURRENCY }
      );

      return res.status(200).json({
        imported: imported.map((skill) => skill.toJSON(auth)),
        updated: updated.map((skill) => skill.toJSON(auth)),
        errors,
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
