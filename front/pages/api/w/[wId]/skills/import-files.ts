import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { parseSkillMarkdown } from "@app/lib/api/skills/detection/parsing";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import formidable from "formidable";
import { readFileSync } from "fs";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

const IMPORT_CONCURRENCY = 4;

const ACCEPTED_EXTENSIONS = new Set([".zip", ".skill", ".md"]);

export type ImportSkillsFromFilesResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  errors: { name: string; message: string }[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ImportSkillsFromFilesResponseBody>
  >,
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
            message: "Skill import from files is not supported.",
          },
        });
      }

      const form = formidable({ multiples: true, maxFileSize: 5 * 1024 * 1024 });
      const [fields, files] = await form.parse(req);
      const uploadedFiles = files.files;

      // Names are sent as repeated form fields: names=foo&names=bar
      const names = fields.names;
      if (!names || names.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "names field is required.",
          },
        });
      }

      if (!uploadedFiles || uploadedFiles.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "No files uploaded.",
          },
        });
      }

      const allDetectedSkills: DetectedSkill[] = [];

      for (const file of uploadedFiles) {
        const filename = file.originalFilename ?? "";
        const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

        if (!ACCEPTED_EXTENSIONS.has(ext)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Unsupported file type "${ext}". Accepted: .md, .zip, .skill`,
            },
          });
        }

        const buffer = readFileSync(file.filepath);

        if (ext === ".zip" || ext === ".skill") {
          const result = detectSkillsFromZip({ zipBuffer: buffer });
          if (result.isErr()) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          }
          allDetectedSkills.push(...result.value);
        } else {
          const content = buffer.toString("utf-8");
          const parsed = parseSkillMarkdown(content);
          if (parsed.name) {
            allDetectedSkills.push({
              name: parsed.name,
              skillMdPath: filename,
              description: parsed.description,
              instructions: parsed.instructions,
              attachments: [],
            });
          }
        }
      }

      const requestedNames = new Set(names);
      const selectedSkills = allDetectedSkills.filter(
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
            if (existing.source !== "local_file") {
              errors.push({
                name: skill.name,
                message: `A different skill named "${skill.name}" already exists.`,
              });
              return;
            }

            const attachedKnowledge = await existing.getAttachedKnowledge(auth);

            await existing.updateSkill(auth, {
              name: skill.name,
              agentFacingDescription: skill.description,
              userFacingDescription: skill.description,
              instructions: skill.instructions,
              icon: existing.icon,
              mcpServerViews: existing.mcpServerViews,
              attachedKnowledge,
              requestedSpaceIds: existing.requestedSpaceIds,
              source: "local_file",
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
              source: "local_file",
              sourceMetadata: null,
              isDefault: false,
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
