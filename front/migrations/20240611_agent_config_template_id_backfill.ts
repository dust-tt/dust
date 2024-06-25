import { QueryTypes } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { makeScript } from "@app/scripts/helpers";

// Backfilling AgentConfiguration.templateId by computing a similarity score between
// the instructions of the AgentConfiguration and the presetInstructions of the templates.
makeScript({}, async ({ execute }) => {
  const acs = await AgentConfiguration.findAll({
    where: {
      templateId: null,
    },
    order: [["createdAt", "DESC"]],
  });
  for (const ac of acs) {
    const instruction = ac.instructions;
    if (!instruction) {
      console.error("AgentConfiguration has no instructions");
      continue;
    }
    const results: { score: number; id: number }[] = await frontSequelize.query(
      `SELECT word_similarity(:instructions, "presetInstructions") as score, id from templates order by score desc limit 1;`,
      {
        replacements: { instructions: instruction },
        type: QueryTypes.SELECT,
      }
    );
    const template = await TemplateModel.findByPk(results[0].id);
    if (!template) {
      console.error("Template not found");
      continue;
    }
    if (results[0].score > 0.8) {
      console.log(
        `AgentConfiguration ${ac.id} matches template ${template.id}, score: ${
          results[0].score
        }: \n---START---\n[${instruction.substring(
          0,
          150
        )}]\n~~~~~~~\n[${template.presetInstructions?.substring(
          0,
          150
        )}]\n---END---\n`
      );
      if (execute) {
        ac.templateId = template.id;
        await ac.save();
      }
    } else {
      console.log(
        `AgentConfiguration ${ac.id} does not match any template, score: ${results[0].score}`
      );
    }
  }
});
