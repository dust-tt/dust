import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/file_detection";
import {
  detectSkillsFromGitHubRepo,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

export type DetectSkillsResponseBody = {
  skills: DetectedSkillSummary[];
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

      let detectedSkills: DetectedSkill[];
      let repoUrl: string | null = null;

      if (isMultipartRequest(req)) {
        // File-based detection.
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
        detectedSkills = result.value;
      } else {
        // GitHub-based detection.
        const body = await parseJsonBody(req);
        const bodyRepoUrl =
          body && typeof body === "object" && "repoUrl" in body
            ? (body as Record<string, unknown>).repoUrl
            : undefined;

        if (!isString(bodyRepoUrl)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "repoUrl is required and must be a string.",
            },
          });
        }

        repoUrl = bodyRepoUrl;

        const accessToken = await getWorkspaceLevelGitHubAccessToken(auth);
        const result = await detectSkillsFromGitHubRepo({
          repoUrl,
          accessToken,
        });

        if (result.isErr()) {
          const { error } = result;

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
                "Error detecting skills from GitHub repo"
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

        detectedSkills = result.value;
      }

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

          if (repoUrl && isSkillFromGitHubRepo(existing, { repoUrl })) {
            return {
              name: skill.name,
              status: "skill_already_exists",
              existingSkillId: existing.sId,
            };
          }

          if (!repoUrl && existing.source === "local_file") {
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
