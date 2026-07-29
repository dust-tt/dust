import { ensureUniqueSIds } from "@app/lib/resources/skill/code_defined/shared";
import { discoverKnowledgeSkill } from "@app/lib/resources/skill/code_defined/system/discover_knowledge";
import { discoverSkillsSkill } from "@app/lib/resources/skill/code_defined/system/discover_skills";
import { discoverToolsSkill } from "@app/lib/resources/skill/code_defined/system/discover_tools";
import { goalModeSkill } from "@app/lib/resources/skill/code_defined/system/goal_mode";
import { planModeSkill } from "@app/lib/resources/skill/code_defined/system/plan_mode";
import { userMemorySkill } from "@app/lib/resources/skill/code_defined/system/user_memory";

export const SYSTEM_SKILLS_ARRAY = ensureUniqueSIds([
  discoverKnowledgeSkill,
  discoverSkillsSkill,
  discoverToolsSkill,
  goalModeSkill,
  planModeSkill,
  userMemorySkill,
] as const);
