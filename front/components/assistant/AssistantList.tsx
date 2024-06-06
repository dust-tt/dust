import { AssistantPreview } from "@dust-tt/sparkle";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import { useRouter } from "next/router";
import React from "react";

interface AssistantListProps {
  agents: LightAgentConfigurationType[];
  handleAssistantClick: (agent: LightAgentConfigurationType) => void;
}

export function AssistantList({
  agents,
  handleAssistantClick,
}: AssistantListProps) {
  const router = useRouter();

  return (
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
                variant="minimal"
                onClick={() => handleAssistantClick(agent)}
                onActionClick={async () => {
                  // Shallow routing to avoid re-fetching the page
                  await router.replace(href, undefined, { shallow: true });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
