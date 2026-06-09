import type {
  ImportSkillsRequestBody,
  ImportSkillsResponseBody,
} from "@app/lib/api/skills/detection/github/import_skills";
import {
  ImportSkillsRequestBodySchema,
  importSkillsFromGitHub,
} from "@app/lib/api/skills/detection/github/import_skills";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import upload from "./upload";

export type { ImportSkillsRequestBody, ImportSkillsResponseBody };

// Mounted at /api/w/:wId/skills/import.
const app = workspaceApp();

app.route("/upload", upload);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsBuilder(),
  validate("json", ImportSkillsRequestBodySchema),
  async (ctx): HandlerResult<ImportSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const { repoUrl, names } = ctx.req.valid("json");

    const result = await importSkillsFromGitHub(auth, { repoUrl, names });
    if (result.isErr()) {
      const error = result.error;
      switch (error.type) {
        case "invalid_url":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: error.message,
            },
          });
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: error.message,
            },
          });
        case "auth_error":
          return apiError(ctx, {
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
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "invalid_request_error",
              message: error.message,
            },
          });
        case "validation_error":
          return apiError(ctx, {
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

    return ctx.json({
      imported: result.value.imported.map((skill) => skill.toJSON(auth)),
      updated: result.value.updated.map((skill) => skill.toJSON(auth)),
      skipped: result.value.skipped,
    });
  }
);

export default app;
