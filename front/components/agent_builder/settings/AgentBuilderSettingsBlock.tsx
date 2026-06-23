import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { AccessSection } from "@app/components/agent_builder/settings/AccessSection";
import { AgentBuilderAvatarSection } from "@app/components/agent_builder/settings/AgentBuilderAvatarSection";
import { AgentBuilderDescriptionSection } from "@app/components/agent_builder/settings/AgentBuilderDescriptionSection";
import { AgentBuilderNameSection } from "@app/components/agent_builder/settings/AgentBuilderNameSection";
import { TagsSection } from "@app/components/agent_builder/settings/TagsSection";

interface AgentBuilderSettingsBlockProps {
  agentConfigurationId: string | null;
  disabled?: boolean;
}

export function AgentBuilderSettingsBlock({
  agentConfigurationId,
  disabled = false,
}: AgentBuilderSettingsBlockProps) {
  const isCreatingNew = !agentConfigurationId;
  return (
    <AgentBuilderSectionContainer title="Settings">
      <div className="space-y-5">
        <div className="flex items-end gap-8">
          <div className="flex-grow">
            <AgentBuilderNameSection
              disabled={disabled}
              isCreatingNew={isCreatingNew}
            />
          </div>
          <AgentBuilderAvatarSection
            disabled={disabled}
            isCreatingNew={isCreatingNew}
          />
        </div>
        <AgentBuilderDescriptionSection
          disabled={disabled}
          isCreatingNew={isCreatingNew}
        />
        <AccessSection disabled={disabled} />
        <TagsSection disabled={disabled} />
      </div>
    </AgentBuilderSectionContainer>
  );
}
