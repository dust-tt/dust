import {
  createAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type {
  AgentAsset,
  CreatedAgent,
  MentionAsset,
  ScheduleTriggerAsset,
  SeedContext,
} from "@app/scripts/seed/factories";
import {
  backdateAgent,
  seedAgents,
  seedMentions,
  seedTriggers,
} from "@app/scripts/seed/factories";

/** Old enough to sit well before any cutoff the allowed thresholds can produce. */
const LONG_AGO = new Date(Date.now() - 90 * ONE_DAY_MS);

function agentAsset(
  name: string,
  description: string,
  // Droid avatar variant (1 to 8), so each seeded agent gets a different picture.
  avatarNumber: number
): AgentAsset {
  return {
    name,
    description,
    instructions: `You are ${name}, seeded to exercise inactive-agent archival.`,
    pictureUrl: `https://dust.tt/static/droidavatar/Droid_Sky_${avatarNumber}.jpg`,
  };
}

// At a 30-day threshold: "Idle Agent" and "Edited Agent" are archivable, the other three are each
// spared by a different rule.
const AGENTS: AgentAsset[] = [
  agentAsset("Idle Agent", "Old and never mentioned: archivable.", 1),
  agentAsset("Recently Used Agent", "Old but mentioned yesterday.", 2),
  agentAsset(
    "Scheduled Agent",
    "Old and unmentioned, but a schedule drives it.",
    3
  ),
  agentAsset("Fresh Agent", "Created today, so too young to be disused.", 4),
  agentAsset(
    "Edited Agent",
    "First version is old; editing must not postpone archival.",
    5
  ),
];

/** Every agent but "Fresh Agent", which has to look new. */
const AGENTS_TO_BACKDATE = AGENTS.filter(({ name }) => name !== "Fresh Agent");

const MENTIONS: MentionAsset[] = [
  {
    conversationId: "InactivityConv01",
    agentName: "Recently Used Agent",
    mentionedAt: new Date(Date.now() - ONE_DAY_MS),
  },
];

const TRIGGERS: ScheduleTriggerAsset[] = [
  {
    name: "Yearly nudge",
    kind: "schedule",
    agentName: "Scheduled Agent",
    customPrompt: null,
    status: "enabled",
    // Yearly, so the seeded agent does not actually run while it sits in a dev workspace.
    configuration: { cron: "0 4 1 1 *", timezone: "UTC" },
  },
];

/**
 * Creates a new version of an agent, as editing it in the UI would, so the scenario contains an
 * agent whose active row is young and whose first version is old. Local to this seed: nothing else
 * needs it.
 */
async function editSeededAgent(
  ctx: SeedContext,
  agent: CreatedAgent,
  asset: AgentAsset
): Promise<void> {
  const { auth, user, execute, logger } = ctx;

  const existing = await getAgentConfiguration(auth, {
    agentId: agent.sId,
    variant: "light",
  });
  if (existing && existing.version > 0) {
    logger.info({ agentId: agent.sId }, "Agent already edited, skipping");
    return;
  }

  logger.info({ agentId: agent.sId }, "Editing agent");

  if (!execute) {
    return;
  }

  const result = await createAgentConfiguration(auth, {
    name: asset.name,
    description: asset.description,
    instructions: "Edited today, still unused.",
    instructionsHtml: null,
    pictureUrl: asset.pictureUrl,
    status: "active",
    scope: "visible",
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      temperature: 0.7,
    },
    templateId: null,
    requestedSpaceIds: [],
    tags: [],
    editors: [user.toJSON()],
    authorId: user.id,
    agentConfigurationId: agent.sId,
  });

  if (result.isErr()) {
    throw result.error;
  }
}

/**
 * Builds the scenario. Exported so a test can assert the answer it promises, which the `makeScript`
 * wrapper alone would hide.
 */
export async function seedInactivity(ctx: SeedContext): Promise<void> {
  // Without the flag the endpoints answer 403, so the scenario would be unreachable.
  ctx.logger.info("Enabling the archive_inactive_agents feature flag");
  if (ctx.execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, [
      "archive_inactive_agents",
    ]);
  }

  const createdAgents = await seedAgents(ctx, AGENTS);

  for (const asset of AGENTS_TO_BACKDATE) {
    const agent = createdAgents.get(asset.name);
    if (!agent) {
      continue;
    }
    await backdateAgent(ctx, { agentId: agent.sId, createdAt: LONG_AGO });
  }

  await seedMentions(ctx, MENTIONS, createdAgents);
  await seedTriggers(ctx, TRIGGERS, createdAgents);

  // Backdated first, so only the version this creates carries today's date.
  const editedAsset = AGENTS.find(({ name }) => name === "Edited Agent");
  const editedAgent = createdAgents.get("Edited Agent");
  if (editedAsset && editedAgent) {
    await editSeededAgent(ctx, editedAgent, editedAsset);
  }

  ctx.logger.info("Inactivity seed completed");
}
