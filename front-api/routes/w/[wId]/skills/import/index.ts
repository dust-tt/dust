import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import upload from "./upload";

const ImportSkillsRequestBodySchema = z.object({
  repoUrl: z.string(),
  names: z.array(z.string()),
});

export type ImportSkillsRequestBody = z.infer<
  typeof ImportSkillsRequestBodySchema
>;

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  skipped: { name: string; message: string }[];
};

// Mounted at /api/w/:wId/skills/import.
const app = new Hono();

app.route("/upload", upload);

app.post(
  "/",
  validate("json", ImportSkillsRequestBodySchema),
  async (ctx): HandlerResult<ImportSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    if (!auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "User is not a builder.",
        },
      });
    }

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
