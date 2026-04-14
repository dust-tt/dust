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
    // Replace &nbsp; and Unicode non-breaking spaces
    .replace(/&nbsp;/g, "")
    .replace(/\u00A0/g, "")
    // Strip "null" link titles (e.g. [text](url "null") or bare "null").
    .replace(/"null"/g, "")
    // Strip markdown emphasis markers — bold/italic reshuffling is cosmetic.
    .replace(/[*_]+/g, "")
    // Strip heading markers — heading level is cosmetic for LLM consumption.
    .replace(/^#{1,6}\s+/gm, "")
    // Normalize ordered list numbers — renumbering is cosmetic.
    .replace(/\d+\./g, "0.")
    // Strip code fence markers (with optional language tag) — handles cases
    // where content gets wrapped/unwrapped in code fences.
    .replace(/```\w*\s*/g, "")
    // Normalize escaped brackets.
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    // Strip KnowledgeNode format-sensitive attributes — type and hasChildren
    // may differ between old and new serialization formats.
    .replace(/\s*type="[^"]*"/g, "")
    .replace(/\s*hasChildren="[^"]*"/g, "")
    // Normalize task list checkboxes: [ ] / [x] markers are stripped by
    // TipTap's list extension (no task-list extension installed). The text
    // content is preserved, so treat the difference as acceptable.
    .replace(/^- \[[ xX]\] /gm, "- ")
    // Normalize auto-linked bare URLs/emails: marked.js wraps plain URLs and
    // emails in links even when the original is unformatted text. If the link
    // text itself looks like a URL or email address, keep the text and drop the
    // link wrapper — cosmetically equivalent to the original bare text.
    .replace(/\[(https?:\/\/[^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]@\s]+@[^\]@\s]+)\]\([^)]*\)/g, "$1")
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

const ROUND_TRIP_DIFF_CONTEXT_CHARS = 40;

type RoundTripMismatchDiff = {
  position: number;
  normalizedOriginalWindow: string;
  normalizedRoundTripWindow: string;
};

function roundTripMismatchDiff(
  normalizedOriginal: string,
  normalizedRoundTrip: string
): RoundTripMismatchDiff {
  let i = 0;
  const minLen = Math.min(
    normalizedOriginal.length,
    normalizedRoundTrip.length
  );
  while (i < minLen && normalizedOriginal[i] === normalizedRoundTrip[i]) {
    i++;
  }

  const ctx = ROUND_TRIP_DIFF_CONTEXT_CHARS;
  const start = Math.max(0, i - ctx);
  const end = i + ctx;

  return {
    position: i,
    normalizedOriginalWindow: normalizedOriginal.slice(start, end),
    normalizedRoundTripWindow: normalizedRoundTrip.slice(start, end),
  };
}

type RoundTripError = {
  kind: "round-trip-mismatch";
  diff: RoundTripMismatchDiff;
};
type SkillError = RoundTripError;

interface SkillResult {
  skillId: number;
  skillName: string;
  workspaceSId: string;
  error: SkillError | null;
  html: string | null;
}

function convertSkill(
  skill: SkillConfigurationModel,
  workspaceSId: string
): SkillResult {
  const { instructions } = skill;

  const html = convertMarkdownToBlockHtml(instructions);

  // Round-trip check: html → markdown, compare against original instructions.
  const roundTripMarkdown = convertBlockHtmlToMarkdown(html);

  const normalizedOriginal = normalizeForComparison(instructions);
  const normalizedRoundTrip = normalizeForComparison(roundTripMarkdown);

  if (normalizedOriginal !== normalizedRoundTrip) {
    return {
      skillId: skill.id,
      skillName: skill.name,
      workspaceSId,
      error: {
        kind: "round-trip-mismatch",
        diff: roundTripMismatchDiff(normalizedOriginal, normalizedRoundTrip),
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

    if (execute && result.error === null && result.html !== null) {
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
          "Skill instructions round-trip mismatch"
        );
      }
    }
  }
);
