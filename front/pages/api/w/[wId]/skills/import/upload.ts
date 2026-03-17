/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { importSkillsFromFiles } from "@app/lib/api/skills/detection/files/import_skills";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { ImportSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/import";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
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
            message: "Skill import is not supported.",
          },
        });
      }

      let fields: formidable.Fields;
      let files: formidable.Files;
      try {
        const form = formidable({
          multiples: true,
          maxFileSize: MAX_ZIP_SIZE_BYTES,
        });
        [fields, files] = await form.parse(req);
      } catch (err) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `File upload failed: ${normalizeError(err).message}`,
          },
        });
      }

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
        errored: result.value.errored,
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
