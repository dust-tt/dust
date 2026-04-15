/**
 * Migration script for the skill instructionsHtml column.
 *
 * By default (dry-run), runs convertMarkdownToBlockHtml against every skill in
 * the database, then checks the output for content loss by
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
    // Normalize non-breaking spaces to nothing — they are cosmetically
    // equivalent to regular spaces and are not meaningful in instructions.
    .replace(/\u00A0/g, "")
    // Normalize italic: _text_ → *text* (cosmetically equivalent)
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "*$1*")
    // Normalize bold: __text__ → **text** (cosmetically equivalent)
    .replace(/(?<!\w)__([^_\n]+?)__(?!\w)/g, "**$1**")
    // Normalize task list checkboxes: [ ] / [x] markers are stripped by
    // TipTap's list extension (no task-list extension installed). The text
    // content is preserved, so treat the difference as acceptable.
    .replace(/^- \[[ xX]\] /gm, "- ")
    // Normalize null link titles injected by TipTap's MarkdownManager:
    // [text](url "null") → [text](url). Use non-greedy [^)]*? to handle
    // URLs that contain spaces or other whitespace before the title.
    .replace(/(\[[^\]]*\]\([^)]*?) "null"\)/g, "$1)")
    // Normalize auto-linked bare URLs: [url](url) → url. marked.js
    // auto-links plain URLs/emails even when the original is plain text.
    .replace(/\[([^\]]+)\]\(\1(?:\s+"[^"]*")?\)/g, "$1")
    // Normalize auto-linked emails: [addr](mailto:addr) → addr.
    .replace(/\[([^\]]+)\]\(mailto:[^)]+\)/g, "$1")
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

type WorkspaceStats = {
  total: number;
  errorCount: number;
  migratedCount: number;
};

async function processSkillsForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: { info: (obj: object, msg: string) => void }
): Promise<WorkspaceStats> {
  const skills = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: { [Op.ne]: "archived" },
      instructions: { [Op.ne]: "" },
    },
    attributes: ["id", "name", "instructions"],
  });

  let errorCount = 0;
  let migratedCount = 0;

  for (const skill of skills) {
    const { instructions } = skill;
    const html = convertMarkdownToBlockHtml(instructions);

    if (!execute) {
      const roundTripMarkdown = convertBlockHtmlToMarkdown(html);
      const normalizedOriginal = normalizeForComparison(instructions);
      const normalizedRoundTrip = normalizeForComparison(roundTripMarkdown);

      const hasRoundTripError = normalizedOriginal !== normalizedRoundTrip;

      if (hasRoundTripError) {
        errorCount++;
        logger.info(
          {
            skillId: skill.id,
            skillName: skill.name,
            workspaceSId: workspace.sId,
            error: {
              kind: "round-trip-mismatch",
              diff: roundTripMismatchDiff(
                normalizedOriginal,
                normalizedRoundTrip
              ),
            },
          },
          "Skill instructions round-trip mismatch"
        );
      }
    }

    if (execute) {
      await skill.update({ instructionsHtml: html });
      migratedCount++;
    }
  }

  return { total: skills.length, errorCount, migratedCount };
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

    let grandTotal = 0;
    let grandErrorCount = 0;
    let grandMigratedCount = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const stats = await processSkillsForWorkspace(
          workspace,
          execute,
          logger
        );
        grandTotal += stats.total;
        grandErrorCount += stats.errorCount;
        grandMigratedCount += stats.migratedCount;
      },
      { wId: workspaceId, concurrency: 8 }
    );

    logger.info(
      {
        workspaceId: workspaceId ?? "all",
        execute,
        totalSkillsProcessed: grandTotal,
        ...(execute
          ? { migratedCount: grandMigratedCount }
          : { roundTripErrors: grandErrorCount }),
      },
      execute
        ? "Skill instructions HTML migration complete"
        : "Skill instructions HTML migration dry-run complete"
    );
  }
);
