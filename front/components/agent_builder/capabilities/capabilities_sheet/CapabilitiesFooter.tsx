import { Chip } from "@dust-tt/sparkle";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import {
  getSelectedToolIcon,
  getSelectedToolLabel,
} from "@app/components/agent_builder/capabilities/mcp/utils/toolDisplayUtils";
import { getSkillIcon } from "@app/lib/skill";

interface CapabilitiesFooterProps {
  localSelectedTools: SelectedTool[];
  localSelectedSkills: AgentBuilderSkillsType[];
  onRemoveSelectedTool: (tool: SelectedTool) => void;
  onRemoveSelectedSkill: (skill: AgentBuilderSkillsType) => void;
}

export function CapabilitiesFooter({
  localSelectedTools,
  localSelectedSkills,
  onRemoveSelectedTool,
  onRemoveSelectedSkill,
}: CapabilitiesFooterProps) {
  const hasCapabilities =
    localSelectedTools.length > 0 || localSelectedSkills.length > 0;

  return (
    <>
      {hasCapabilities && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Selected capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {localSelectedSkills.map((skill, index) => (
              <Chip
                key={index}
                icon={getSkillIcon(skill.icon)}
                label={skill.name}
                onRemove={() => onRemoveSelectedSkill(skill)}
                size="xs"
                color="green"
              />
            ))}
            {localSelectedTools.map((tool, index) => (
              <Chip
                key={index}
                icon={getSelectedToolIcon(tool)}
                label={getSelectedToolLabel(tool)}
                onRemove={() => onRemoveSelectedTool(tool)}
                size="xs"
                color="green"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
