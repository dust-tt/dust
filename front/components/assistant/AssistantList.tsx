import { AssistantPreview } from "@dust-tt/sparkle";
import type {
  ConversationType,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React from "react";

interface AssistantListProps {
  agents: LightAgentConfigurationType[];
  handleAssistantClick: (
    agent: LightAgentConfigurationType,
    conversation?: ConversationType
  ) => void;
}

const AssistantList: React.FC<AssistantListProps> = ({
  agents,
  handleAssistantClick,
}) => {
  const router = useRouter();

  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2 px-4 md:grid-cols-3">
        {agents.map((agent) => {
          const href = {
            pathname: router.pathname,
            query: {
              ...router.query,
              assistantDetails: agent.sId,
            },
          };
          return (
            <div
              key={agent.sId}
              className="rounded-xl border border-structure-100"
            >
              <div
                onClick={(e) => {
                  e.preventDefault();
                  handleAssistantClick(agent);
                }}
              >
                <AssistantPreview
                  title={agent.name}
                  pictureUrl={agent.pictureUrl}
                  subtitle={agent.lastAuthors?.join(", ") ?? ""}
                  description=""
                  variant="minimalGallery"
                  onClick={() => handleAssistantClick(agent)}
                  onActionClick={async () => {
                    await router.replace(href);
                    console.log("Button clicked");
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default AssistantList;
