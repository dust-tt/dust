import { AssistantPreview } from "@dust-tt/sparkle";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";

export const AssistantListPage = () => {
  const { agentConfigurations } = usePublicAgentConfigurations();

  return (
    <div className="w-full h-full overflow-auto">
      {agentConfigurations.map((agent) => (
        <AssistantPreview
          key={`${agent.sId}`}
          variant="list"
          description={agent.description}
          subtitle={agent.lastAuthors?.join(", ") ?? ""}
          title={agent.name}
          pictureUrl={agent.pictureUrl}
          onClick={() => {}}
        />
      ))}
    </div>
  );
};
