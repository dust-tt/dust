import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";

import type { SeedContext, SkillSuggestionAsset } from "./types";

export async function seedSkillSuggestions(
  ctx: SeedContext,
  suggestions: SkillSuggestionAsset[],
  skills: Map<string, SkillResource>
): Promise<void> {
  const { auth, execute, logger } = ctx;

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
      { skillName: suggestionAsset.skillName },
      "Creating skill suggestion..."
    );

    if (execute) {
      let sourceConversationIds: number[] | null = null;
      if (suggestionAsset.sourceConversationIds) {
        sourceConversationIds = await resolveConversationModelIds(
          ctx,
          suggestionAsset.sourceConversationIds
        );
      }

      const created = await SkillSuggestionFactory.create(auth, skill, {
        kind: suggestionAsset.kind,
        suggestion: suggestionAsset.suggestion,
        analysis: suggestionAsset.analysis,
        title: suggestionAsset.title ?? null,
        state: suggestionAsset.state,
        source: suggestionAsset.source,
        sourceConversationIds,
      });
      logger.info(
        { sId: created.sId, skillName: suggestionAsset.skillName },
        "Skill suggestion created"
      );
    }
  }
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
        { conversationSId: sId },
        "Conversation not found for skill suggestion source, skipping"
      );
    }
  }
  return modelIds;
}
