/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { importSkillsFromFiles } from "@app/lib/api/skills/detection/import_skills_from_files";
import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { SkillType } from "@app/types/assistant/skill_configuration";
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

        if (!uploadedFiles || uploadedFiles.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "No files uploaded.",
            },
          });
        }

        const result = await importSkillsFromFiles(auth, {
          uploadedFiles,
          names: fieldNames,
        });
        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        }

        return res.status(200).json({
          imported: result.value.imported.map((skill) => skill.toJSON(auth)),
          updated: result.value.updated.map((skill) => skill.toJSON(auth)),
          errors: result.value.errors,
        });
      }

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
            message: "Invalid request body: repoUrl and names are required.",
          },
        });
      }

      const { repoUrl: rawRepoUrl, names: rawNames } = body;
      if (!isString(rawRepoUrl) || !Array.isArray(rawNames)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body: repoUrl must be a string and names must be an array.",
          },
        });
      }

      const result = await importSkillsFromGitHub(auth, {
        repoUrl: rawRepoUrl,
        names: rawNames.filter(isString),
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
