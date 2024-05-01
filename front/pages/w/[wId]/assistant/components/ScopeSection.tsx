import { Avatar, ContextItem } from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
} from "@dust-tt/types";

import { SCOPE_INFO } from "@app/components/assistant/Sharing";

interface ScopeSectionProps {
  assistantList: LightAgentConfigurationType[];
  scope: AgentConfigurationScope;
  onClick: (agent: LightAgentConfigurationType) => void;
}

export function ScopeSection({
  assistantList,
  scope,
  onClick,
}: ScopeSectionProps) {
  const filteredList = assistantList.filter((agent) => agent.scope === scope);

  if (filteredList.length === 0) {
    return null;
  }

  return (
    <>
      <ContextItem.SectionHeader
        title={SCOPE_INFO[scope].label + "s"}
        description={SCOPE_INFO[scope].text}
      />
      {filteredList.map((agent) => (
        <ContextItem
          key={agent.sId}
          title={`@${agent.name}`}
          subElement={`By: ${agent.lastAuthors
            ?.map((author) => author)
            .join(", ")}`}
          visual={<Avatar visual={agent.pictureUrl} size="md" />}
          onClick={() => onClick(agent)}
        >
          <ContextItem.Description>
            <div className="line-clamp-2 text-element-700">
              {agent.description}
            </div>
          </ContextItem.Description>
        </ContextItem>
      ))}
    </>
  );
}
