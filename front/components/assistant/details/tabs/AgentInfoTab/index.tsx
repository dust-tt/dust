import { Chip, Page } from "@dust-tt/sparkle";
import React from "react";

import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantKnowledgeSection";
import { AssistantToolsSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantToolsSection";
import type { AgentConfigurationType, WorkspaceType } from "@app/types";

export function AgentInfoTab({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  return (
    <div className="flex flex-col gap-5">
      {agentConfiguration.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentConfiguration.tags.map((tag) => (
            <Chip key={tag.sId} color="golden" label={tag.name} size="xs" />
          ))}
        </div>
      )}

      {agentConfiguration.description && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          {agentConfiguration.description}
        </div>
      )}

      {agentConfiguration.scope !== "global" && (
        <>
          <Page.Separator />

          <AssistantKnowledgeSection
            agentConfiguration={agentConfiguration}
            owner={owner}
          />

          <div className="dd-privacy-mask flex flex-col gap-3">
            <div className="text-base font-semibold text-foreground dark:text-foreground-night">
              Instructions
            </div>
            {agentConfiguration?.instructions ? (
              <div className="border-structure-200 bg-structure-50 rounded-lg border p-4">
                <AgentMessageMarkdown
                  content={agentConfiguration.instructions}
                  owner={owner}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Instructions
              </div>
            )}
          </div>
        </>
      )}

      <AssistantToolsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />
    </div>
  );
}
