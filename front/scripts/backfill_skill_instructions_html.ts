import { SkillConfigurationModel } from "@app/lib/models/skill";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

// Recompute instructionsHtml from the markdown instructions for skills whose
// stored HTML escaped their skill references into literal text (`&lt;skill ...`
// / `&lt;unavailable_skill ...`). The server-side markdown->HTML converter used
// to drop skill references before they were wired into it; this re-renders the
// affected rows so the builder shows the reference chips again.
const ESCAPED_SKILL_TAGS = ["&lt;skill ", "&lt;unavailable_skill "];

makeScript({}, async ({ execute }, logger) => {
  const rows = await SkillConfigurationModel.findAll({
    where: {
      instructionsHtml: {
        [Op.or]: ESCAPED_SKILL_TAGS.map((tag) => ({ [Op.like]: `%${tag}%` })),
      },
    },
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Backfill runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  logger.info({ count: rows.length }, "Skills with escaped skill references");

  let updated = 0;

  for (const row of rows) {
    const nextHtml = convertMarkdownToBlockHtml(row.instructions);

    logger.info(
      { skillModelId: row.id, name: row.name, workspaceId: row.workspaceId },
      "Recomputing instructionsHtml"
    );

    if (execute) {
      await row.update({ instructionsHtml: nextHtml });
    }
    updated++;
  }

  logger.info({ updated, execute }, "Backfill complete");
});
