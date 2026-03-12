import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { parseSkillMarkdown } from "@app/lib/api/skills/detection/parsing";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import formidable from "formidable";
import { readFileSync } from "fs";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

export type DetectSkillsFromFilesResponseBody = {
  skills: DetectedSkillSummary[];
};

const ACCEPTED_EXTENSIONS = new Set([".zip", ".skill", ".md"]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DetectSkillsFromFilesResponseBody>>,
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

      const form = formidable({
        multiples: true,
        maxFileSize: 5 * 1024 * 1024,
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

      if (allDetectedSkills.length === 0) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message:
              "No skills found in the uploaded files. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).",
          },
        });
      }

      const skillSummaries = await concurrentExecutor(
        allDetectedSkills,
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
            status:
              existing.source === "local_file"
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
