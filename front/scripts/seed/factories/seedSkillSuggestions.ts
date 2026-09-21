import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";

import type { SeedContext, SkillSuggestionAsset } from "./types";

/**
 * Seeds skill suggestions. Returns the created (or already existing) suggestions keyed by the
 * asset `id` for assets that define one.
 *
 * A suggestion is considered already seeded when the skill has a suggestion with the same kind,
 * source and title, so re-running a seed does not duplicate titled suggestions. Assets flagged
 * `overwrite` are deleted and recreated instead of kept.
 */
export async function seedSkillSuggestions(
  ctx: SeedContext,
  suggestions: SkillSuggestionAsset[],
  skills: Map<string, SkillResource>
): Promise<Map<string, SkillSuggestionResource>> {
  const { auth, execute, logger } = ctx;
  const created = new Map<string, SkillSuggestionResource>();

  for (const suggestionAsset of suggestions) {
    const skill = skills.get(suggestionAsset.skillName);
    if (!skill) {
      logger.warn(
        { skillName: suggestionAsset.skillName },
        "Skill not found for suggestion, skipping"
      );
      continue;
    }

    logger.info(
      { skillName: suggestionAsset.skillName, kind: suggestionAsset.kind },
      "Creating skill suggestion..."
    );

    if (!execute) {
      continue;
    }

    const title = suggestionAsset.title ?? null;
    const existing = title
      ? await findExistingSuggestion(ctx, skill, suggestionAsset)
      : null;
    if (existing) {
      if (!suggestionAsset.overwrite) {
        logger.info(
          { sId: existing.sId, title },
          "Skill suggestion already exists, skipping"
        );
        if (suggestionAsset.id) {
          created.set(suggestionAsset.id, existing);
        }
        continue;
      }
      logger.info(
        { sId: existing.sId, title },
        "Skill suggestion already exists, deleting to recreate it"
      );
      const deleteResult = await existing.delete(auth);
      if (deleteResult.isErr()) {
        throw new Error(
          `Failed to delete skill suggestion ${existing.sId}: ${deleteResult.error.message}`
        );
      }
    }

    let sourceConversationIds: number[] | null = null;
    if (suggestionAsset.sourceConversationIds) {
      sourceConversationIds = await resolveConversationModelIds(
        ctx,
        suggestionAsset.sourceConversationIds
      );
    }

    const resource = await SkillSuggestionFactory.create(auth, skill, {
      kind: suggestionAsset.kind,
      suggestion: suggestionAsset.suggestion,
      analysis: suggestionAsset.analysis,
      title,
      state: suggestionAsset.state,
      source: suggestionAsset.source,
      sourceConversationIds,
    });
    logger.info(
      { sId: resource.sId, skillName: suggestionAsset.skillName },
      "Skill suggestion created"
    );
    if (suggestionAsset.id) {
      created.set(suggestionAsset.id, resource);
    }
  }

  return created;
}

async function findExistingSuggestion(
  ctx: SeedContext,
  skill: SkillResource,
  asset: SkillSuggestionAsset
): Promise<SkillSuggestionResource | null> {
  const existing = await SkillSuggestionResource.listBySkillConfigurationId(
    ctx.auth,
    skill.sId,
    {
      kinds: [asset.kind],
      sources: [asset.source],
      limit: 100,
      dangerouslyBypassConversationsVisibilityCheck: true,
    }
  );
  return existing.find((s) => s.title === asset.title) ?? null;
}

async function resolveConversationModelIds(
  ctx: SeedContext,
  conversationIds: string[]
): Promise<number[]> {
  const modelIds: number[] = [];
  for (const sId of conversationIds) {
    const conversation = await ConversationResource.fetchById(ctx.auth, sId, {
      dangerouslySkipPermissionFiltering: true,
    });
    if (conversation) {
      modelIds.push(conversation.id);
    } else {
      ctx.logger.warn(
        { conversationId: sId },
        "Conversation not found for skill suggestion source, skipping"
      );
    }
  }
  return modelIds;
}
