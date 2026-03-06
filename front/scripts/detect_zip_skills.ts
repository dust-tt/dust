import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import { makeScript } from "@app/scripts/helpers";
import fs from "fs";

makeScript(
  {
    zipFile: {
      type: "string",
      demandOption: true,
      describe: "Path to a ZIP file containing skills",
    },
  },
  async ({ zipFile }, logger) => {
    const zipBuffer = fs.readFileSync(zipFile);
    const result = detectSkillsFromZip({ zipBuffer });

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        `Detection failed: ${result.error.message}`
      );
      return;
    }

    const skills = result.value;
    logger.info(`Found ${skills.length} skill(s) in ${zipFile}`);

    for (const skill of skills) {
      logger.info(
        {
          name: skill.name,
          skillMdPath: skill.skillMdPath,
          descriptionLength: skill.description.length,
          instructionsLength: skill.instructions.length,
          attachmentCount: skill.attachments.length,
          attachments: skill.attachments.map((a) => a.path),
        },
        "Skill"
      );
    }
  }
);
