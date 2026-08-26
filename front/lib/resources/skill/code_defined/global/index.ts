import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { docxSkill } from "@app/lib/resources/skill/code_defined/global/docx";
import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import { goDeepSkill } from "@app/lib/resources/skill/code_defined/global/go_deep";
import { jobSkill } from "@app/lib/resources/skill/code_defined/global/job";
import { mentionUsersSkill } from "@app/lib/resources/skill/code_defined/global/mention_users";
import { podFunctionsSkill } from "@app/lib/resources/skill/code_defined/global/pod_functions";
import { pptxSkill } from "@app/lib/resources/skill/code_defined/global/pptx";
import { projectsSkill } from "@app/lib/resources/skill/code_defined/global/projects";
import { sandboxSkill } from "@app/lib/resources/skill/code_defined/global/sandbox";
import { skillAuthoringSkill } from "@app/lib/resources/skill/code_defined/global/skill_authoring";
import { supportSkill } from "@app/lib/resources/skill/code_defined/global/support";
import { workspaceAnalyticsSkill } from "@app/lib/resources/skill/code_defined/global/workspace_analytics";
import { xlsxSkill } from "@app/lib/resources/skill/code_defined/global/xlsx";
import { ensureUniqueSIds } from "@app/lib/resources/skill/code_defined/shared";

export const GLOBAL_SKILLS_ARRAY = ensureUniqueSIds([
  activationSkill,
  docxSkill,
  framesSkill,
  goDeepSkill,
  jobSkill,
  mentionUsersSkill,
  podFunctionsSkill,
  pptxSkill,
  projectsSkill,
  sandboxSkill,
  skillAuthoringSkill,
  supportSkill,
  workspaceAnalyticsSkill,
  xlsxSkill,
] as const);
