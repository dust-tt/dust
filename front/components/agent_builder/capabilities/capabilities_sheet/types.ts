import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SelectedTool } from "@app/components/agent_builder/capabilities/shared/types";
import type {
  CapabilitiesSheetState,
  SheetState,
} from "@app/components/agent_builder/skills/types";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";

export type CapabilityFilterType = "all" | "tools" | "skills";

export type CapabilitiesSheetContentProps = {
  isOpen: boolean;
  sheetState: CapabilitiesSheetState;
  onStateChange: (state: SheetState) => void;
  onClose: () => void;
  onCapabilitiesSave: (data: {
    skills: AgentBuilderSkillsType[];
    additionalSpaces: string[];
    tools: SelectedTool[];
  }) => void;
  onToolEditSave: (updatedAction: BuilderAction) => void;
  alreadyRequestedSpaceIds: Set<string>;
  alreadyAddedSkillIds: Set<string>;
  selectedActions: BuilderAction[];
  getAgentInstructions: () => string;
};
