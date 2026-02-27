import { detectSkillsFromGitHubRepo } from "@app/lib/api/skills/github_detection/detect_skills";
import { makeScript } from "@app/scripts/helpers";

// TODO(2026-02-25 aubin): move to a poke plugin or a CLI command if ends up being needed for debugging.
makeScript(
  {
    repoUrl: {
      type: "string",
      demandOption: true,
      describe: "GitHub repository (e.g. anthropics/skills)",
    },
    accessToken: {
      type: "string",
      demandOption: false,
      describe: "GitHub access token (required for private repos)",
    },
  },
  async ({ repoUrl, accessToken }, logger) => {
    const result = await detectSkillsFromGitHubRepo({ repoUrl, accessToken });

    if (result.isErr()) {
      logger.error(
        { error: result.error },
        `Detection failed: ${result.error.message}`
      );
      return;
    }

    const skills = result.value;
    logger.info(`Found ${skills.length} skill(s) in ${repoUrl}`);

    for (const skill of skills) {
      logger.info(
        {
          dirPath: skill.dirPath,
          descriptionLength: skill.description.length,
          instructionsLength: skill.instructions.length,
          attachmentCount: skill.attachments.length,
        },
        "Skill"
      );
    }
  }
);
