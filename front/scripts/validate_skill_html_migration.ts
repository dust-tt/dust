/**
 * Dry-run validation script for the skill instructionsHtml migration.
 *
 * Runs convertMarkdownToBlockHtml against every skill in the database that has
 * non-empty markdown instructions and a null instructionsHtml column, then
 * checks the output for:
 *   1. Content loss — converts HTML back to markdown and string-compares against the
 *      original instructions. Any content dropped or mutated by the pipeline shows up
 *      as a diff.
 *   2. Structural issues — missing block IDs, wrong root wrapper.
 *
 * Writes NOTHING to the database.
 */

import { BLOCK_ID_ATTRIBUTE } from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  convertBlockHtmlToMarkdown,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import * as cheerio from "cheerio";
import { Op } from "sequelize";

// Block-level node types that must carry a data-block-id attribute in the output HTML.
const BLOCK_LEVEL_SELECTORS = ["p", "h1", "h2", "h3", "ul", "ol"].join(", ");

const ZWS = "\u200B";

const IssueCode = {
  CONVERSION_FAILED: "conversion-failed",
  ROUND_TRIP_THROW: "round-trip-throw",
  ROUND_TRIP_MISMATCH: "round-trip-mismatch",
  MISSING_ROOT_WRAPPER: "missing-root-wrapper",
  ROOT_BLOCK_ID_MISMATCH: "root-block-id-mismatch",
  BLOCKS_MISSING_BLOCK_ID: "blocks-missing-block-id",
} as const;

type IssueCodeType = (typeof IssueCode)[keyof typeof IssueCode];

type SkillIssue = { code: IssueCodeType; message: string };

const STRUCTURAL_ISSUE_CODES = new Set<IssueCodeType>([
  IssueCode.MISSING_ROOT_WRAPPER,
  IssueCode.ROOT_BLOCK_ID_MISMATCH,
  IssueCode.BLOCKS_MISSING_BLOCK_ID,
]);

/**
 * Normalize markdown for comparison.
 *
 * Fenced code blocks are extracted first and restored last so their content
 * is never affected by the whitespace rules below.
 *
 * Outside code blocks:
 *   - strip zero-width spaces (injected by angle-bracket escaping)
 *   - single newlines → space  (markdown convention: \n within a paragraph = space)
 *   - collapse multiple spaces to one
 *   - trim overall
 */
function normalizeForComparison(s: string): string {
  const codeBlocks: string[] = [];
  const MARKER = "\x00N\x00";

  const withPlaceholders = s.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `${MARKER}${codeBlocks.length - 1}${MARKER}`;
  });

  const normalized = withPlaceholders
    .replace(new RegExp(ZWS, "g"), "")
    .replace(/\s+/g, " ")
    .trim();

  if (codeBlocks.length === 0) {
    return normalized;
  }
  return normalized.replace(
    new RegExp(`${MARKER}(\\d+)${MARKER}`, "g"),
    (_, i) => codeBlocks[parseInt(i, 10)]
  );
}

interface SkillResult {
  skillId: number;
  skillName: string;
  workspaceSId: string;
  issues: SkillIssue[];
  roundTripDiff: string | null;
}

function validateSkill(
  skill: SkillConfigurationModel,
  workspaceSId: string
): SkillResult {
  const { instructions } = skill;
  const issues: SkillIssue[] = [];
  let roundTripDiff: string | null = null;

  // 1. Convert markdown to HTML.
  let html: string;
  try {
    html = convertMarkdownToBlockHtml(instructions);
  } catch (err) {
    const error = normalizeError(err);
    return {
      skillId: skill.id,
      skillName: skill.name,
      workspaceSId,
      issues: [
        {
          code: IssueCode.CONVERSION_FAILED,
          message: `conversion threw: ${error.message}`,
        },
      ],
      roundTripDiff: null,
    };
  }

  // 2. Round-trip check: html → markdown, compare against original instructions.
  let roundTripMarkdown: string;
  try {
    roundTripMarkdown = convertBlockHtmlToMarkdown(html);
  } catch (err) {
    const error = normalizeError(err);
    issues.push({
      code: IssueCode.ROUND_TRIP_THROW,
      message: `round-trip threw: ${error.message}`,
    });
    roundTripMarkdown = "";
  }

  if (
    roundTripMarkdown !== "" &&
    normalizeForComparison(instructions) !==
      normalizeForComparison(roundTripMarkdown)
  ) {
    roundTripDiff = `original: "${instructions.slice(0, 300)}" | round-tripped: "${roundTripMarkdown.slice(0, 300)}"`;
    issues.push({
      code: IssueCode.ROUND_TRIP_MISMATCH,
      message: "round-trip-mismatch",
    });
  }

  // 3. Structural checks on output HTML
  const $ = cheerio.load(html, { xmlMode: false }, false);

  // 3a. Root wrapper must exist with the correct data-type and a stable block-id.
  const root = $(`div[data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`);
  if (root.length === 0) {
    issues.push({
      code: IssueCode.MISSING_ROOT_WRAPPER,
      message: "missing-instructions-root-wrapper",
    });
  } else {
    const rootBlockId = root.attr(`data-${BLOCK_ID_ATTRIBUTE}`);
    if (rootBlockId !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) {
      issues.push({
        code: IssueCode.ROOT_BLOCK_ID_MISMATCH,
        message: `root-block-id-mismatch: expected "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}", got "${rootBlockId}"`,
      });
    }
  }

  // 3b. Every block-level element must have a data-block-id
  const blocksWithoutId = $(BLOCK_LEVEL_SELECTORS).filter(
    (_, el) => !$(el).attr(`data-${BLOCK_ID_ATTRIBUTE}`)
  );
  if (blocksWithoutId.length > 0) {
    const tags = blocksWithoutId
      .map((_, el) => $(el).prop("tagName")?.toLowerCase())
      .get()
      .join(", ");
    issues.push({
      code: IssueCode.BLOCKS_MISSING_BLOCK_ID,
      message: `blocks-missing-block-id: ${blocksWithoutId.length} element(s): ${tags}`,
    });
  }

  return {
    skillId: skill.id,
    skillName: skill.name,
    workspaceSId,
    issues,
    roundTripDiff,
  };
}

async function validateSkillsForWorkspace(
  workspace: LightWorkspaceType
): Promise<SkillResult[]> {
  const skills = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      instructions: { [Op.ne]: "" },
      instructionsHtml: { [Op.is]: null },
    },
    attributes: ["id", "name", "instructions"],
  });

  return skills.map((skill) => validateSkill(skill, workspace.sId));
}

function isClean(r: SkillResult): boolean {
  return r.issues.length === 0 && r.roundTripDiff === null;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Validate skills for a single workspace (sId). Omit to run on all workspaces.",
    },
  },
  async ({ workspaceId }, logger) => {
    logger.info(
      { workspaceId: workspaceId ?? "all" },
      "Starting skill HTML validation"
    );

    const allResults: SkillResult[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        const results = await validateSkillsForWorkspace(workspace);
        allResults.push(...results);
      },
      { wId: workspaceId }
    );

    const grandTotal = allResults.length;
    const roundTripFailures = allResults.filter(
      (r) => r.roundTripDiff !== null
    );
    const structuralIssues = allResults.filter((r) =>
      r.issues.some((i) => STRUCTURAL_ISSUE_CODES.has(i.code))
    );
    const conversionErrors = allResults.filter((r) =>
      r.issues.some((i) => i.code === IssueCode.CONVERSION_FAILED)
    );
    const cleanCount = allResults.filter(isClean).length;

    logger.info(
      {
        workspaceId: workspaceId ?? "all",
        totalSkillsProcessed: grandTotal,
        cleanConversions: cleanCount,
        roundTripFailureCount: roundTripFailures.length,
        structuralIssueCount: structuralIssues.length,
        conversionErrorCount: conversionErrors.length,
      },
      "Skill instructions HTML migration validation complete"
    );

    for (const r of conversionErrors) {
      logger.info(
        {
          skillId: r.skillId,
          skillName: r.skillName,
          workspaceSId: r.workspaceSId,
          issues: r.issues.map((i) => i.message),
        },
        "Skill instructions HTML conversion failed"
      );
    }

    for (const r of roundTripFailures) {
      logger.info(
        {
          skillId: r.skillId,
          skillName: r.skillName,
          workspaceSId: r.workspaceSId,
          roundTripDiff: r.roundTripDiff,
        },
        "Skill instructions markdown round-trip mismatch after HTML conversion"
      );
    }

    for (const r of structuralIssues) {
      logger.info(
        {
          skillId: r.skillId,
          skillName: r.skillName,
          workspaceSId: r.workspaceSId,
          issues: r.issues.map((i) => i.message),
        },
        "Skill instructions HTML output has structural issues"
      );
    }
  }
);
