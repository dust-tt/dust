import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/file_detection";
import {
  detectSkillsFromGitHubRepo,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSourceType } from "@app/types/assistant/skill_configuration";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

const IMPORT_CONCURRENCY = 4;

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  errors: { name: string; message: string }[];
};

function isMultipartRequest(req: NextApiRequest): boolean {
  const contentType = req.headers["content-type"] ?? "";
  return contentType.startsWith("multipart/");
}

function parseJsonBody(req: NextApiRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

interface GitHubSource {
  type: "github";
  repoUrl: string;
}

interface FileSource {
  type: "local_file";
}

type ImportSource = GitHubSource | FileSource;

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
            message: "Skill import is not supported.",
          },
        });
      }

      let allDetectedSkills: DetectedSkill[];
      let names: string[];
      let source: ImportSource;

      if (isMultipartRequest(req)) {
        // File-based import.
        const form = formidable({
          multiples: true,
          maxFileSize: 5 * 1024 * 1024,
        });
        const [fields, files] = await form.parse(req);
        const uploadedFiles = files.files;

        const fieldNames = fields.names;
        if (!fieldNames || fieldNames.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "names field is required.",
            },
          });
        }
        names = fieldNames;

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
        allDetectedSkills = result.value;
        source = { type: "local_file" };
      } else {
        // GitHub-based import.
        const body = await parseJsonBody(req);

        if (
          !body ||
          typeof body !== "object" ||
          !("repoUrl" in body) ||
          !("names" in body)
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body: repoUrl and names are required.",
            },
          });
        }

        const parsed = body as Record<string, unknown>;
        if (
          typeof parsed.repoUrl !== "string" ||
          !Array.isArray(parsed.names)
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body: repoUrl must be a string and names must be an array.",
            },
          });
        }

        const repoUrl = parsed.repoUrl;
        names = parsed.names.filter(
          (n): n is string => typeof n === "string"
        );

        const accessToken = await getWorkspaceLevelGitHubAccessToken(auth);
        const result = await detectSkillsFromGitHubRepo({
          repoUrl,
          accessToken,
        });
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

        allDetectedSkills = result.value;
        source = { type: "github", repoUrl };
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

      const skillSourceType: SkillSourceType = source.type;

      await concurrentExecutor(
        selectedSkills,
        async (skill) => {
          const existing = await SkillResource.fetchActiveByName(
            auth,
            skill.name
          );

          if (existing) {
            const canUpdate =
              source.type === "github"
                ? isSkillFromGitHubRepo(existing, {
                    repoUrl: source.repoUrl,
                  })
                : existing.source === "local_file";

            if (!canUpdate) {
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
              source: skillSourceType,
              sourceMetadata:
                source.type === "github"
                  ? { repoUrl: source.repoUrl, filePath: skill.skillMdPath }
                  : undefined,
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
              source: skillSourceType,
              sourceMetadata:
                source.type === "github"
                  ? { repoUrl: source.repoUrl, filePath: skill.skillMdPath }
                  : null,
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
