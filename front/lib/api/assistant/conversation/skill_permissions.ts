import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

/**
 * Update the conversation requestedSpaceIds based on the skills added to it. This function is
 * purely additive - requirements are never removed.
 *
 * Each skill's requestedSpaceIds represents the set of spaces the skill needs access to.
 * When a skill is added to a conversation (slash command, input bar dropdown, conversation fork,
 * agent runtime enable, ...), its spaces are appended to the conversation's requirements so that
 * conversation access is gated on those spaces.
 */
export async function updateConversationRequirementsForSkills(
  auth: Authenticator,
  {
    skills,
    conversation,
    t,
  }: {
    skills: SkillResource[];
    conversation: ConversationWithoutContentType;
    t?: Transaction;
  }
): Promise<void> {
  // By design, pod conversations are always visible to everyone with READ permission to the
  // project, so their requirements stay pinned to [projectSpaceId]. As with agents, we do not
  // append per-skill space requirements for pod conversations.
  if (isPodConversation(conversation)) {
    return;
  }

  const newSpaceRequirements = uniq(skills.flatMap((s) => s.requestedSpaceIds));
  if (newSpaceRequirements.length === 0) {
    return;
  }

  // conversation.requestedSpaceIds are space sIds; convert back to ModelIds to merge with the
  // skill requirements (which are already ModelIds).
  const currentSpaceRequirements = removeNulls(
    conversation.requestedSpaceIds.map(getResourceIdFromSId)
  );
  const currentSet = new Set(currentSpaceRequirements);

  // Early return if all new requirements are already present.
  if (newSpaceRequirements.every((id) => currentSet.has(id))) {
    return;
  }

  const allSpaceRequirements = uniq([
    ...currentSpaceRequirements,
    ...newSpaceRequirements,
  ]);

  await ConversationResource.updateRequirements(
    auth,
    conversation.sId,
    allSpaceRequirements,
    t
  );
}
