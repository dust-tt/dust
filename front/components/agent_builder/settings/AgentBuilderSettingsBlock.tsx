import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { AccessSection } from "@app/components/agent_builder/settings/AccessSection";
import { AgentBuilderAvatarSection } from "@app/components/agent_builder/settings/AgentBuilderAvatarSection";
import { AgentBuilderDescriptionSection } from "@app/components/agent_builder/settings/AgentBuilderDescriptionSection";
import { AgentBuilderNameSection } from "@app/components/agent_builder/settings/AgentBuilderNameSection";
import { TagsSection } from "@app/components/agent_builder/settings/TagsSection";
import type { ReactNode } from "react";

interface AgentBuilderSettingsBlockProps {
  agentConfigurationId: string | null;
  editorGateButton?: ReactNode;
}

export function AgentBuilderSettingsBlock({
  agentConfigurationId,
  editorGateButton,
}: AgentBuilderSettingsBlockProps) {
  const isCreatingNew = !agentConfigurationId;
  return (
    <AgentBuilderSectionContainer title="Settings">
      <div className="space-y-5">
        <div className="flex items-end gap-8">
          <div className="flex-grow">
            <AgentBuilderNameSection isCreatingNew={isCreatingNew} />
          </div>
          <AgentBuilderAvatarSection isCreatingNew={isCreatingNew} />
        </div>
        <AgentBuilderDescriptionSection isCreatingNew={isCreatingNew} />
        <AccessSection editorGateButton={editorGateButton} />
        <TagsSection />
      </div>
    </AgentBuilderSectionContainer>
  );
}
