import { Hono } from "hono";

import {
  detectSkillsFromGitHubRepo,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import { initGitHubRepoClient } from "@app/lib/api/skills/detection/github/github_api";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";

import upload from "./upload";

export type DetectSkillsResponseBody = {
  skills: DetectedSkillSummary[];
};

// Mounted at /api/w/:wId/skills/detect.
const app = new Hono();

app.route("/upload", upload);

app.post("/", async (c) => {
  const auth = c.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isBuilder()) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message: "User is not a builder.",
        },
      },
      403
    );
  }

  const body = await c.req.json().catch(() => null);
  const repoUrl = body?.repoUrl;

  if (!isString(repoUrl)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "repoUrl is required and must be a string.",
        },
      },
      400
    );
  }

  const accessToken = await getWorkspaceLevelGitHubAccessToken(auth);
  const clientResult = initGitHubRepoClient({ repoUrl, accessToken });
  if (clientResult.isErr()) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: clientResult.error.message,
        },
      },
      400
    );
  }

  const result = await detectSkillsFromGitHubRepo(clientResult.value);

  if (result.isErr()) {
    const { error } = result;

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
          "Error detecting skills from GitHub repo"
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

  const detectedSkills = result.value;

  if (detectedSkills.length === 0) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message:
            "No skills found in this repository. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).",
        },
      },
      400
    );
  }

  const existingSkills = await SkillResource.fetchByNames(
    auth,
    detectedSkills.map((s) => s.name)
  );

  const existingSkillsMap = new Map(existingSkills.map((s) => [s.name, s]));

  const skillSummaries: DetectedSkillSummary[] = detectedSkills.map((skill) => {
    const existing = existingSkillsMap.get(skill.name);

    if (!existing) {
      return {
        name: skill.name,
        status: "ready",
        existingSkillId: null,
      };
    }

    return {
      name: skill.name,
      status: isSkillFromGitHubRepo(existing, { repoUrl })
        ? "skill_already_exists"
        : "name_conflict",
      existingSkillId: existing.sId,
    };
  });

  return c.json({ skills: skillSummaries });
});

export default app;
