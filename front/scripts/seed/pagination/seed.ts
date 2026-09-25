import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeScript } from "@app/scripts/helpers";
import type { AgentAsset, SkillAsset } from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgent,
  seedSkill,
} from "@app/scripts/seed/factories";
import { removeNulls } from "@app/types/shared/utils/general";

const TOPICS = [
  "Sales",
  "Marketing",
  "Support",
  "Finance",
  "Legal",
  "Hiring",
  "Product",
  "Security",
  "Research",
  "Ops",
];

const AGENT_ROLES = [
  "Assistant",
  "Reviewer",
  "Writer",
  "Analyst",
  "Planner",
  "Coach",
  "Scout",
  "Tracker",
  "Helper",
  "Advisor",
];

const SKILL_ACTIONS = [
  "Report",
  "Checklist",
  "Summary",
  "Playbook",
  "Review",
  "Brief",
  "Digest",
  "Template",
  "Audit",
  "Forecast",
];

const PICTURE_URLS = [
  "https://dust.tt/static/droidavatar/Droid_Green_7.jpg",
  "https://dust.tt/static/droidavatar/Droid_Indigo_1.jpg",
  "https://dust.tt/static/droidavatar/Droid_Purple_5.jpg",
  "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
  "https://dust.tt/static/droidavatar/Droid_Teal_2.jpg",
  "https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg",
];

// Topic × role/action pairs give unique names that share words, so name search and pagination
// can be exercised together.
function pairs(suffixes: string[], count: number): [string, string][] {
  return TOPICS.flatMap((topic) =>
    suffixes.map((suffix): [string, string] => [topic, suffix])
  ).slice(0, count);
}

function buildAgentAssets(count: number): AgentAsset[] {
  return pairs(AGENT_ROLES, count).map(([topic, role], index) => ({
    name: `${topic}${role}`,
    description: `${role} for ${topic.toLowerCase()} questions.`,
    instructions: `You are a ${role.toLowerCase()} helping the ${topic.toLowerCase()} team.`,
    pictureUrl: PICTURE_URLS[index % PICTURE_URLS.length],
    // One agent in five is unpublished, to exercise the editor-only visibility.
    scope: index % 5 === 4 ? "hidden" : "visible",
  }));
}

function buildSkillAssets(count: number): SkillAsset[] {
  return pairs(SKILL_ACTIONS, count).map(([topic, action], index) => {
    const description = `Produces a ${topic.toLowerCase()} ${action.toLowerCase()}.`;
    return {
      name: `${topic} ${action}`,
      agentFacingDescription: description,
      userFacingDescription: description,
      instructions: `Write a ${topic.toLowerCase()} ${action.toLowerCase()}.`,
      instructionsHtml: `<p>Write a ${topic.toLowerCase()} ${action.toLowerCase()}.</p>`,
      // One skill in five stays editor-only.
      availability: index % 5 === 4 ? "editors" : "workspace_users",
    };
  });
}

const MAX_COUNT = TOPICS.length * AGENT_ROLES.length;

makeScript(
  {
    count: {
      type: "number",
      default: 100,
      describe: `Number of agents and of skills to create (at most ${MAX_COUNT}).`,
    },
  },
  async ({ count, execute }, logger) => {
    if (count < 1 || count > MAX_COUNT) {
      throw new Error(`--count must be between 1 and ${MAX_COUNT}.`);
    }
    const ctx = await createSeedContext({ execute, logger });

    const skills = [];
    for (const asset of buildSkillAssets(count)) {
      skills.push(await seedSkill(ctx, asset));
    }
    const agents = [];
    for (const asset of buildAgentAssets(count)) {
      agents.push(await seedAgent(ctx, asset));
    }

    if (!execute) {
      return;
    }

    // Writes already queue indexation after commit; re-queue so skipped (pre-existing) entries
    // are searchable too.
    await AgentResource.launchSearchIndexation(
      ctx.auth,
      removeNulls(agents).map((agent) => agent.sId)
    );
    await SkillResource.launchSearchIndexation(
      ctx.auth,
      removeNulls(skills).map((skill) => skill.sId)
    );

    logger.info(
      {
        workspaceId: ctx.workspace.sId,
        agentCount: agents.length,
        skillCount: skills.length,
      },
      "Pagination seed complete"
    );
  }
);
