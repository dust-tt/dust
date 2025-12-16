import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { UserType, WorkspaceType } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

export const SKILLS_SHEET_PAGE_IDS = {
  SELECTION: "add",
  INFO: "info",
} as const;

export type SkillsSheetMode =
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION;
      selectedSkills: AgentBuilderSkillsType[];
    }
  | {
      type: typeof SKILLS_SHEET_PAGE_IDS.INFO;
      skillConfiguration: SkillType & SkillConfigurationRelations;
      previousMode: SelectionMode;
    };

export type SelectionMode = Extract<
  SkillsSheetMode,
  { type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
>;

export type PageContentProps = {
  mode: SkillsSheetMode;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  onClose: () => void;
  onSave: (skills: AgentBuilderSkillsType[]) => void;
  owner: WorkspaceType;
  user: UserType;
};
