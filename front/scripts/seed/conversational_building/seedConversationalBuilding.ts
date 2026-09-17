import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  ConversationAsset,
  CreatedAgent,
  SeedContext,
  SkillAsset,
  SkillSuggestionAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedConversations,
  seedSkill,
  seedSkillSuggestions,
  seedUsers,
} from "@app/scripts/seed/factories";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import * as fs from "fs";
import * as path from "path";

export const SKILL_NAME = "MeetingNotesFormatter";
export const LUKE_USER_SID = "SeedUserLuke";
export const CONVERSATION_SID = "ConvBuildingConv01";

interface Assets {
  users: UserAsset[];
  skills: SkillAsset[];
  skillSuggestions: SkillSuggestionAsset[];
  conversations: ConversationAsset[];
}

export function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const read = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(assetsDir, file), "utf-8"));
  return {
    users: read("users.json"),
    skills: read("skills.json"),
    skillSuggestions: read("skill_suggestions.json"),
    conversations: read("conversations.json"),
  };
}

export interface SeedConversationalBuildingResult {
  users: Map<string, UserResource>;
  skills: Map<string, SkillResource>;
  skillSuggestions: Map<string, SkillSuggestionResource>;
}

export async function seedConversationalBuilding(
  ctx: SeedContext
): Promise<SeedConversationalBuildingResult> {
  const { logger } = ctx;
  const { users, skills, skillSuggestions, conversations } = loadAssets();

  // 1. Additional users (Luke and Leila).
  logger.info("Seeding users...");
  const createdUsers = await seedUsers(ctx, users);

  // 2. The skill, owned by the main user with Luke as editor so the editors suggestion
  // (add Leila, remove Luke) is meaningful.
  logger.info("Seeding skills...");
  const createdSkills = new Map<string, SkillResource>();
  const luke = createdUsers.get(LUKE_USER_SID);
  for (const skillAsset of skills) {
    const skill = await seedSkill(ctx, skillAsset, {
      editors: luke ? [luke] : [],
    });
    if (skill) {
      createdSkills.set(skillAsset.name, skill);
    }
  }

  // 3. Conversational suggestions on the skill.
  logger.info("Seeding skill suggestions...");
  const createdSkillSuggestions = await seedSkillSuggestions(
    ctx,
    skillSuggestions,
    createdSkills
  );

  // 4. The Dust conversation embedding the suggestions as `:skill_suggestion[]` directives.
  logger.info("Seeding conversations...");
  const agents = new Map<string, CreatedAgent>([
    ["Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" }],
  ]);
  await seedConversations(ctx, conversations, {
    agents,
    placeholders: {
      __MEETING_NOTES_SKILL_SID__: createdSkills.get(SKILL_NAME)?.sId ?? "",
      __SKILL_EDIT_INSTRUCTIONS_SUGGESTION_SID__:
        createdSkillSuggestions.get("skillEditInstructions")?.sId ?? "",
      __SKILL_EDIT_DESCRIPTION_SUGGESTION_SID__:
        createdSkillSuggestions.get("skillEditDescription")?.sId ?? "",
      __SKILL_EDITORS_SUGGESTION_SID__:
        createdSkillSuggestions.get("skillEditors")?.sId ?? "",
    },
    additionalUsers: createdUsers,
  });

  return {
    users: createdUsers,
    skills: createdSkills,
    skillSuggestions: createdSkillSuggestions,
  };
}
