import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { AccessSection } from "@app/components/agent_builder/settings/AccessSection";
import { AgentBuilderAvatarSection } from "@app/components/agent_builder/settings/AgentBuilderAvatarSection";
import { AgentBuilderDescriptionSection } from "@app/components/agent_builder/settings/AgentBuilderDescriptionSection";
import { AgentBuilderNameSection } from "@app/components/agent_builder/settings/AgentBuilderNameSection";
import { TagsSection } from "@app/components/agent_builder/settings/TagsSection";

interface AgentBuilderSettingsBlockProps {
  agentConfigurationId: string | null;
}

export function AgentBuilderSettingsBlock({
  agentConfigurationId,
}: AgentBuilderSettingsBlockProps) {
  const isCreatingNew = !agentConfigurationId;
  return (
    <AgentBuilderSectionContainer title="Settings">
      <div className="space-y-5">
        <div className="flex items-end gap-8">
          <div className="flex-grow">
            <AgentBuilderNameSection />
          </div>
          <AgentBuilderAvatarSection isCreatingNew={isCreatingNew} />
        </div>
        <AgentBuilderDescriptionSection isCreatingNew={isCreatingNew} />
        <AccessSection />
        <TagsSection />
      </div>
    </AgentBuilderSectionContainer>
  );
}
