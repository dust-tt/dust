import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  ConversationAsset,
  CreatedAgent,
  DataSourceAsset,
  RemoteMCPToolAsset,
  SeedContext,
  SkillAsset,
  SkillSuggestionAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedConversations,
  seedDataSources,
  seedRemoteMCPTool,
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
export const TEAM_CALENDAR_TOOL_PLACEHOLDER = "__TEAM_CALENDAR_TOOL_ID__";
export const GLOSSARY_DSV_PLACEHOLDER = "__MEETING_NOTES_ARCHIVE_DSV_ID__";
export const GLOSSARY_SPACE_PLACEHOLDER = "__MEETING_NOTES_ARCHIVE_SPACE_ID__";

interface Assets {
  users: UserAsset[];
  skills: SkillAsset[];
  skillSuggestions: SkillSuggestionAsset[];
  conversations: ConversationAsset[];
  dataSources: DataSourceAsset[];
  mcpTools: RemoteMCPToolAsset[];
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
    dataSources: read("data_sources.json"),
    mcpTools: read("mcp_tools.json"),
  };
}

export interface SeedConversationalBuildingResult {
  users: Map<string, UserResource>;
  skills: Map<string, SkillResource>;
  skillSuggestions: Map<string, SkillSuggestionResource>;
  // The Team Calendar tool referenced by the tool edit suggestion. Null on dry runs.
  toolView: MCPServerViewResource | null;
  // The Meeting Notes Archive view referenced by the knowledge edit suggestion. Null on dry runs
  // and when the data source could not be created (no CoreAPI).
  knowledgeView: DataSourceViewResource | null;
}

export async function seedConversationalBuilding(
  ctx: SeedContext
): Promise<SeedConversationalBuildingResult> {
  const { logger } = ctx;
  const {
    users,
    skills,
    skillSuggestions,
    conversations,
    dataSources,
    mcpTools,
  } = loadAssets();

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

  // 3. The tool and the knowledge referenced by the tool and knowledge edit suggestions.
  logger.info("Seeding MCP tools...");
  const toolView = await seedRemoteMCPTool(ctx, mcpTools[0]);

  logger.info("Seeding data sources...");
  const knowledgeView = await seedGlossaryDataSource(ctx, dataSources);

  const suggestionPlaceholders: Record<string, string> = {
    [TEAM_CALENDAR_TOOL_PLACEHOLDER]: toolView?.sId ?? "",
    [GLOSSARY_DSV_PLACEHOLDER]: knowledgeView?.sId ?? "",
    [GLOSSARY_SPACE_PLACEHOLDER]: knowledgeView?.space.sId ?? "",
  };

  // 4. Conversational suggestions on the skill.
  logger.info("Seeding skill suggestions...");
  const createdSkillSuggestions = await seedSkillSuggestions(
    ctx,
    skillSuggestions.map((s) =>
      resolveSkillSuggestionPlaceholders(s, suggestionPlaceholders)
    ),
    createdSkills
  );

  // 5. The Dust conversation embedding the suggestions as `:skill_suggestion[]` directives.
  logger.info("Seeding conversations...");
  const agents = new Map<string, CreatedAgent>([
    ["Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" }],
  ]);
  const suggestionSId = (id: string) =>
    createdSkillSuggestions.get(id)?.sId ?? "";
  await seedConversations(ctx, conversations, {
    agents,
    placeholders: {
      __MEETING_NOTES_SKILL_SID__: createdSkills.get(SKILL_NAME)?.sId ?? "",
      __SKILL_EDIT_INSTRUCTIONS_SUGGESTION_SID__: suggestionSId(
        "skillEditInstructions"
      ),
      __SKILL_EDIT_DESCRIPTION_SUGGESTION_SID__: suggestionSId(
        "skillEditDescription"
      ),
      __SKILL_EDITORS_SUGGESTION_SID__: suggestionSId("skillEditors"),
      __SKILL_EDIT_TOOL_SUGGESTION_SID__: suggestionSId("skillEditTool"),
      __SKILL_EDIT_KNOWLEDGE_SUGGESTION_SID__:
        suggestionSId("skillEditKnowledge"),
      __SKILL_USER_FACING_DESCRIPTION_SUGGESTION_SID__: suggestionSId(
        "skillUserFacingDescription"
      ),
    },
    additionalUsers: createdUsers,
  });

  return {
    users: createdUsers,
    skills: createdSkills,
    skillSuggestions: createdSkillSuggestions,
    toolView,
    knowledgeView,
  };
}

// Creating a data source needs a running CoreAPI, which test environments may not have: the
// failure is logged and the knowledge suggestion keeps its placeholders.
async function seedGlossaryDataSource(
  ctx: SeedContext,
  dataSources: DataSourceAsset[]
): Promise<DataSourceViewResource | null> {
  try {
    await seedDataSources(ctx, dataSources);
  } catch (e) {
    ctx.logger.warn(
      { error: e },
      "Failed to seed data sources (CoreAPI unavailable?), the knowledge suggestion will have unresolved placeholders"
    );
    return null;
  }

  if (!ctx.execute) {
    return null;
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    ctx.auth,
    dataSources[0].name
  );
  if (!dataSource) {
    return null;
  }
  const [view] = await DataSourceViewResource.listForDataSources(ctx.auth, [
    dataSource,
  ]);

  return view ?? null;
}

function resolveSkillSuggestionPlaceholders(
  suggestion: SkillSuggestionAsset,
  placeholders: Record<string, string>
): SkillSuggestionAsset {
  if (suggestion.kind !== "edit") {
    return suggestion;
  }

  const instructionEdits = suggestion.suggestion.instructionEdits?.map(
    (edit) => {
      let content = edit.content;
      for (const [key, value] of Object.entries(placeholders)) {
        content = content.replaceAll(key, value);
      }
      return { ...edit, content };
    }
  );

  return {
    ...suggestion,
    suggestion: { ...suggestion.suggestion, instructionEdits },
  };
}
