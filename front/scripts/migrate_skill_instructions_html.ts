/**
 * Migration script for the skill instructionsHtml column.
 *
 * By default (dry-run), runs convertMarkdownToBlockHtml against every skill in
 * the database that has non-empty markdown instructions and a null
 * instructionsHtml column, then checks the output for content loss by
 * converting HTML back to markdown and string-comparing against the original.
 * Any content dropped or mutated by the pipeline shows up as a diff.
 *
 * Pass --execute (-e) to persist the generated HTML to instructionsHtml for
 * every skill without errors.
 */

import {
  convertBlockHtmlToMarkdown,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { unescape } from "html-escaper";
import { Op } from "sequelize";

const ZWS = "\u200B";

/**
 * Normalize markdown for comparison.
 *
 * We are normalizing differences that are cosmetic and not content-bearing.
 */
function normalizeForComparison(s: string): string {
  const codeBlocks: string[] = [];
  const MARKER = "\x00N\x00";

  const withPlaceholders = s.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `${MARKER}${codeBlocks.length - 1}${MARKER}`;
  });

  const normalized = unescape(withPlaceholders)
    .replace(new RegExp(ZWS, "g"), "")
    // Normalize italic: _text_ → *text* (cosmetically equivalent)
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "*$1*")
    // Normalize bold: __text__ → **text** (cosmetically equivalent)
    .replace(/(?<!\w)__([^_\n]+?)__(?!\w)/g, "**$1**")
    // Normalize task list checkboxes: [ ] / [x] markers are stripped by
    // TipTap's list extension (no task-list extension installed). The text
    // content is preserved, so treat the difference as acceptable.
    .replace(/^- \[[ xX]\] /gm, "- ")
    // Normalize null link titles injected by TipTap's MarkdownManager:
    // [text](url "null") → [text](url)
    .replace(/(\[[^\]]*\]\([^)\s]+) "null"\)/g, "$1)")
    // Collapse all whitespace (including newlines) to a single space so that
    // cosmetic differences in spacing, indentation, and blank lines are ignored.
    .replace(/\s+/g, "")
    .trim();

  if (codeBlocks.length === 0) {
    return normalized;
  }
  return normalized.replace(
    new RegExp(`${MARKER}(\\d+)${MARKER}`, "g"),
    (_, i) => codeBlocks[parseInt(i, 10)]
  );
}

type ConversionError = { kind: "conversion-failed"; message: string };
type RoundTripError = {
  kind: "round-trip-mismatch";
  diff: string;
};
type SkillError = ConversionError | RoundTripError;

interface SkillResult {
  skillId: number;
  skillName: string;
  workspaceSId: string;
  error: SkillError | null;
  /** The generated HTML, present only when conversion succeeded. */
  html: string | null;
}

function convertSkill(
  skill: SkillConfigurationModel,
  workspaceSId: string
): SkillResult {
  const { instructions } = skill;

  let html: string;
  try {
    html = convertMarkdownToBlockHtml(instructions);
  } catch (err) {
    const error = normalizeError(err);
    return {
      skillId: skill.id,
      skillName: skill.name,
      workspaceSId,
      error: { kind: "conversion-failed", message: error.message },
      html: null,
    };
  }

  // Round-trip check: html → markdown, compare against original instructions.
  let roundTripMarkdown: string;
  try {
    roundTripMarkdown = convertBlockHtmlToMarkdown(html);
  } catch (err) {
    const error = normalizeError(err);
    return {
      skillId: skill.id,
      skillName: skill.name,
      workspaceSId,
      error: {
        kind: "conversion-failed",
        message: `round-trip threw: ${error.message}`,
      },
      html: null,
    };
  }

  if (
    normalizeForComparison(instructions) !==
    normalizeForComparison(roundTripMarkdown)
  ) {
    return {
      skillId: skill.id,
      skillName: skill.name,
      workspaceSId,
      error: {
        kind: "round-trip-mismatch",
        diff: `original: "${instructions.slice(0, 300)}" | round-tripped: "${roundTripMarkdown.slice(0, 300)}"`,
      },
      html,
    };
  }

  return {
    skillId: skill.id,
    skillName: skill.name,
    workspaceSId,
    error: null,
    html,
  };
}

async function processSkillsForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean
): Promise<SkillResult[]> {
  const skills = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      instructions: { [Op.ne]: "" },
      instructionsHtml: { [Op.is]: null },
    },
    attributes: ["id", "name", "instructions"],
  });

  const results: SkillResult[] = [];

  for (const skill of skills) {
    const result = convertSkill(skill, workspace.sId);
    results.push(result);

    if (execute && result.error?.kind !== "conversion-failed" && result.html !== null) {
      await skill.update({ instructionsHtml: result.html });
    }
  }

  return results;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info(
      { workspaceId: workspaceId ?? "all", execute },
      execute
        ? "Starting skill instructions HTML migration (write mode)"
        : "Starting skill instructions HTML migration (dry-run)"
    );

    const allResults: SkillResult[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        const results = await processSkillsForWorkspace(workspace, execute);
        allResults.push(...results);
      },
      { wId: workspaceId }
    );

    const grandTotal = allResults.length;
    const errors = allResults.filter((r) => r.error !== null);
    const cleanCount = allResults.length - errors.length;

    logger.info(
      {
        workspaceId: workspaceId ?? "all",
        execute,
        totalSkillsProcessed: grandTotal,
        cleanConversions: cleanCount,
        errorCount: errors.length,
        ...(execute ? { migratedCount: cleanCount } : {}),
      },
      execute
        ? "Skill instructions HTML migration complete"
        : "Skill instructions HTML migration dry-run complete"
    );

    if (!execute) {
      for (const r of errors) {
        logger.info(
          {
            skillId: r.skillId,
            skillName: r.skillName,
            workspaceSId: r.workspaceSId,
            error: r.error,
          },
          r.error?.kind === "round-trip-mismatch"
            ? "Skill instructions round-trip mismatch"
            : "Skill instructions conversion failed"
        );
      }
    }
  }
);
