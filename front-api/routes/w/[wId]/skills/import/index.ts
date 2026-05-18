import { Hono } from "hono";
import { z } from "zod";

import { importSkillsFromGitHub } from "@app/lib/api/skills/detection/github/import_skills";
import logger from "@app/logger/logger";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { validate } from "@front-api/middleware/validator";

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

app.post("/", validate("json", ImportSkillsRequestBodySchema), async (c) => {
  const auth = c.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isBuilder()) {
    return c.json(
      {
        error: { type: "app_auth_error", message: "User is not a builder." },
      },
      403
    );
  }

  const { repoUrl, names } = c.req.valid("json");

  const result = await importSkillsFromGitHub(auth, { repoUrl, names });
  if (result.isErr()) {
    const error = result.error;
    switch (error.type) {
      case "invalid_url":
        return c.json(
          {
            error: { type: "invalid_request_error", message: error.message },
          },
          400
        );
      case "not_found":
        return c.json(
          {
            error: { type: "invalid_request_error", message: error.message },
          },
          404
        );
      case "auth_error":
        return c.json(
          {
            error: { type: "invalid_request_error", message: error.message },
          },
          401
        );
      case "github_api_error":
        logger.error(
          { error, workspaceId: owner.sId },
          "Error detecting skills from GitHub repo during import"
        );
        return c.json(
          {
            error: { type: "invalid_request_error", message: error.message },
          },
          500
        );
      case "validation_error":
        return c.json(
          {
            error: { type: "invalid_request_error", message: error.message },
          },
          400
        );
      default:
        assertNever(error);
    }
  }

  return c.json({
    imported: result.value.imported.map((skill) => skill.toJSON(auth)),
    updated: result.value.updated.map((skill) => skill.toJSON(auth)),
    skipped: result.value.skipped,
  });
});

export default app;
