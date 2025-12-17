import { Chip } from "@dust-tt/sparkle";
import React from "react";

import type {
  SelectedTool,
  SkillSelection,
} from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import {
  getSelectedToolIcon,
  getSelectedToolLabel,
} from "@app/components/agent_builder/capabilities/mcp/utils/toolDisplayUtils";
import { SKILL_ICON } from "@app/lib/skill";

interface MCPServerViewsFooterProps {
  selectedToolsInSheet: SelectedTool[];
  selectedSkillsInSheet: SkillSelection[];
  onRemoveSelectedTool: (tool: SelectedTool) => void;
  onRemoveSelectedSkill: (skill: SkillSelection) => void;
}

export function MCPServerViewsFooter({
  selectedToolsInSheet,
  selectedSkillsInSheet,
  onRemoveSelectedTool,
  onRemoveSelectedSkill,
}: MCPServerViewsFooterProps) {
  const hasSkills = selectedSkillsInSheet.length > 0;
  const hasTools = selectedToolsInSheet.length > 0;
  const hasAny = hasSkills || hasTools;

  const label = hasSkills ? "Selected capabilities" : "Selected tools";

  return (
    <>
      {hasAny && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{label}</h2>
          <div className="flex flex-wrap gap-2">
            {selectedSkillsInSheet.map((skill) => (
              <Chip
                key={`skill-${skill.sId}`}
                icon={SKILL_ICON}
                label={skill.name}
                onRemove={() => onRemoveSelectedSkill(skill)}
                size="xs"
                color="green"
              />
            ))}
            {selectedToolsInSheet.map((tool, index) => (
              <Chip
                key={`tool-${index}`}
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
